const test = require("node:test");
const assert = require("node:assert/strict");
const { createPortfolioProposalService } = require("../features/portfolio/services/portfolioProposal.service");
const { createPortfolioScenarioService } = require("../features/portfolio/services/portfolioScenario.service");

function proposal() {
  return {
    proposalId: "11111111-1111-4111-8111-111111111111", proposalType: "CASH_MANAGEMENT", title: "Hold more cash",
    objective: "Target 30% cash", reasoning: ["Reduce exposure"], assumptions: [], rationale: [], requiredApprovals: ["USER_REVIEW"],
    actions: [{ actionType: "SET_CASH_TARGET", symbol: "", sector: "", industry: "", strategyId: "", matrixCell: { id: "", sector: "", regime: "" }, currentValue: 20, proposedValue: 30, unit: "PERCENT", targetWeights: [] }],
    evidence: [], confidence: 80, expectedBenefit: "More liquidity", potentialDownside: "Less exposure", simulationAvailable: true,
  };
}

function harness({ stale = false } = {}) {
  const proposals = [];
  const decisions = [];
  let forbiddenMutations = 0;
  const db = {
    portfolioProposal: {
      create: async ({ data }) => { const row = { ...data, createdAt: new Date(), decisions: [] }; proposals.push(row); return row; },
      findFirst: async ({ where }) => { const row = proposals.find((item) => item.id === where.id && item.userId === where.userId); return row ? { ...row, decisions: decisions.filter((item) => item.proposalId === row.id).sort((a, b) => b.createdAt - a.createdAt) } : null; },
      findMany: async ({ where }) => proposals.filter((item) => item.userId === where.userId).map((row) => ({ ...row, decisions: decisions.filter((item) => item.proposalId === row.id).sort((a, b) => b.createdAt - a.createdAt) })),
      update: async () => { forbiddenMutations += 1; }, delete: async () => { forbiddenMutations += 1; },
    },
    portfolioProposalDecision: { create: async ({ data }) => { const row = { id: `d-${decisions.length + 1}`, ...data, createdAt: new Date(Date.now() + decisions.length) }; decisions.push(row); return row; } },
  };
  db.$transaction = async (callback) => callback(db);
  const context = {
    provider: "INTERNAL_PAPER", executionMode: "INTERNAL_PAPER", account: { equity: 100000, cash: 20000 },
    positions: [{ symbol: "NVDA", sector: "Technology", industry: "Semiconductors", marketValue: 80000, currentPrice: 100, portfolioWeightPct: 80 }],
    freshness: { stale, portfolioSnapshotTimestamp: "2026-07-10T04:00:00Z", marketPriceTimestamp: "2026-07-10T04:00:00Z" },
    tradingState: { reconciliation: { matched: true }, strategyAllocations: [], matrixAllocations: [], availableStrategies: [] },
  };
  const service = createPortfolioProposalService({
    prisma: { run: async (callback) => callback(db) }, contextService: { buildContext: async () => context }, scenarioService: createPortfolioScenarioService(),
  });
  return { decisions, forbiddenMutations: () => forbiddenMutations, proposals, service };
}

test("saving creates an immutable owned proposal with pending approval", async () => {
  const state = harness();
  const saved = await state.service.save("user-1", { proposal: proposal(), sourcePrompt: "Hold more cash" });
  assert.equal(saved.id, proposal().proposalId);
  assert.equal(saved.approvalStatus, "PENDING");
  assert.equal(saved.simulationJson.noChangesApplied, true);
  assert.equal(state.forbiddenMutations(), 0);
  assert.equal((await state.service.list("user-1")).length, 1);
  assert.equal((await state.service.list("user-2")).length, 0);
});

test("approval appends a decision without modifying portfolio or proposal records", async () => {
  const state = harness();
  const saved = await state.service.save("user-1", { proposal: proposal() });
  const approved = await state.service.approve("user-1", saved.id, "Reviewed by user");
  assert.equal(approved.approvalStatus, "APPROVED");
  assert.equal(state.decisions.length, 2);
  assert.equal(state.forbiddenMutations(), 0);
  assert.equal(state.decisions[1].metadataJson.executionCreated, false);
  await assert.rejects(() => state.service.approve("user-1", saved.id), /only pending/i);
});

test("approval rejects stale data and cross-user access", async () => {
  const state = harness({ stale: true });
  const saved = await state.service.save("user-1", { proposal: proposal() });
  await assert.rejects(() => state.service.approve("user-1", saved.id), /must be current/i);
  await assert.rejects(() => state.service.approve("user-2", saved.id), /not found/i);
});
