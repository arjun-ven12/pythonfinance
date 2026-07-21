const { requireUserId } = require("../../../repositories/ownership");
const {
  approvalEvent,
  backtestEvent,
  brokerFillEvent,
  brokerOrderEvent,
  brokerOrderTransitionEvent,
  internalPaperExecutionEvents,
  matrixProposalEvent,
  matrixReplayEvent,
  opportunityEvent,
  portfolioProposalEvent,
  portfolioSnapshotEvent,
  researchProjectEvent,
  researchReportEvent,
  strategyVersionEvent,
} = require("./memoryEvents");

function createMemoryBackfillService({ prisma, ingestionService, logger = console }) {
  async function run(userId, options = {}) {
    const ownerId = requireUserId(userId);
    const limit = Math.min(500, Math.max(1, Number(options.limit) || 100));
    const offset = Math.max(0, Number(options.offset) || 0);
    const after = options.after ? new Date(options.after) : new Date(0);
    const dryRun = options.dryRun === true;
    if (Number.isNaN(after.getTime())) throw new Error("Invalid backfill cursor date.");

    const records = await prisma.run(async (db) => {
      const find = (modelName, extra = {}) => {
        const model = db[modelName];
        if (!model?.findMany) return Promise.resolve([]);
        return model.findMany({
          where: { userId: ownerId, createdAt: { gt: after }, ...(extra.where || {}) },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip: offset,
          take: limit,
          ...(extra.include ? { include: extra.include } : {}),
        });
      };
      const [versions, runs, replays, matrixProposals, portfolioProposals, projects, reports, approvals, fills, orders, snapshots, paperTrades, opportunities] = await Promise.all([
        find("strategyVersion", { include: { experiment: { select: { name: true } } } }),
        find("strategyRun", { include: { experiment: { select: { name: true } } } }),
        find("matrixReplaySnapshot"), find("matrixProposal"), find("portfolioProposal"),
        find("researchProject"), find("researchReport"), find("approvalRequest"), find("brokerFill"),
        find("brokerOrder"), find("portfolioState"), find("paperTrade"),
        find("opportunity", { where: { opportunityScore: { gte: Math.min(100, Math.max(0, Number(options.scannerMinScore) || 70)) } } }),
      ]);
      return { versions, runs, replays, matrixProposals, portfolioProposals, projects, reports, approvals, fills, orders, snapshots, paperTrades, opportunities };
    });

    const events = [
      ...records.versions.map((item) => strategyVersionEvent(item, item.experiment?.name)),
      ...records.runs.map((item) => backtestEvent(item, item.experiment?.name)),
      ...records.replays.map(matrixReplayEvent),
      ...records.matrixProposals.flatMap((item) => [matrixProposalEvent(item), ...(item.status === "APPROVED" ? [matrixProposalEvent(item, "MATRIX_PROPOSAL_APPROVED")] : item.status === "REJECTED" ? [matrixProposalEvent(item, "MATRIX_PROPOSAL_REJECTED")] : [])]),
      ...records.portfolioProposals.map(portfolioProposalEvent),
      ...records.projects.map(researchProjectEvent),
      ...records.reports.map(researchReportEvent),
      ...records.approvals.map((item) => approvalEvent(item, item.status === "APPROVED" ? "APPROVAL_APPROVED" : item.status === "REJECTED" ? "APPROVAL_REJECTED" : "APPROVAL_CREATED")),
      ...records.orders.flatMap((item) => [brokerOrderEvent(item), brokerOrderTransitionEvent(item)]),
      ...records.fills.map(brokerFillEvent),
      ...records.snapshots.map((item) => portfolioSnapshotEvent(item, { trigger: "HISTORICAL_BACKFILL" })),
      ...records.paperTrades.flatMap((item) => internalPaperExecutionEvents(item)),
      ...records.opportunities.map((item) => opportunityEvent(item)),
    ].map((event) => ({ ...event, createdByType: "BACKFILL" }));

    const scanned = Object.fromEntries(Object.entries(records).map(([key, value]) => [key, value.length]));
    const newest = events.reduce((latest, event) => new Date(event.occurredAt) > latest ? new Date(event.occurredAt) : latest, after);
    const hasFullPage = Object.values(records).some((items) => items.length === limit);
    if (dryRun) {
      const plannedByType = events.reduce((counts, event) => ({ ...counts, [event.eventType]: (counts[event.eventType] || 0) + 1 }), {});
      const summary = { userId: ownerId, dryRun: true, scanned, planned: events.length, plannedByType, ingested: 0, duplicates: 0, failed: 0, nextCursor: newest.toISOString(), nextOffset: hasFullPage ? offset + limit : 0 };
      logger.info?.("memory_backfill_dry_run_completed", summary);
      return summary;
    }

    const results = await ingestionService.recordEvents(events);
    const summary = { userId: ownerId, dryRun: false, scanned, attempted: events.length, ingested: results.filter((item) => item.event && !item.duplicate).length, duplicates: results.filter((item) => item.duplicate).length, failed: results.filter((item) => item.error).length, nextCursor: newest.toISOString(), nextOffset: hasFullPage ? offset + limit : 0 };
    logger.info?.("memory_backfill_completed", summary);
    return summary;
  }
  return { run };
}

module.exports = { createMemoryBackfillService };
