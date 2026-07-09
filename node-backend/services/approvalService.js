const prisma = require("./prisma");
const { ownedWhere, requireUserId } = require("../repositories/ownership");
const ledgerRepository = require("../repositories/transactionLedgerRepository");

const ALLOWED_TRANSITIONS = Object.freeze({
  PENDING: new Set(["APPROVED", "REJECTED", "SNOOZED"]),
  SNOOZED: new Set(["PENDING"]),
  APPROVED: new Set(["EXECUTED"]),
  REJECTED: new Set(),
  EXECUTED: new Set(),
});

function createApprovalError(message, statusCode = 409) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertAllowedTransition(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];

  if (!allowed || !allowed.has(toStatus)) {
    throw createApprovalError(
      `Approval transition ${fromStatus} -> ${toStatus} is not allowed.`
    );
  }
}

function appendAuditEvent(raw, event) {
  const currentRaw = raw && typeof raw === "object" ? raw : {};
  const auditEvents = Array.isArray(currentRaw.audit_events)
    ? currentRaw.audit_events
    : [];

  return {
    ...currentRaw,
    audit_events: [...auditEvents, event],
  };
}

async function requireApprovedApprovalForExecution(client, id, userId) {
  const ownerId = requireUserId(userId);
  const approval = await client.approvalRequest.findFirst({
    where: ownedWhere(ownerId, { id, status: "APPROVED" }),
  });

  if (!approval) {
    throw createApprovalError(
      "Approved approval request not found for this user.",
      404
    );
  }

  return approval;
}

async function transitionApprovalRequest({
  id,
  userId,
  toStatus,
  decisionNote = null,
  updates = {},
}) {
  const ownerId = requireUserId(userId);

  return prisma.run((db) =>
    db.$transaction(async (transaction) => {
      const current = await transaction.approvalRequest.findFirst({
        where: ownedWhere(ownerId, { id }),
      });

      if (!current) {
        throw createApprovalError("Approval request not found.", 404);
      }

      assertAllowedTransition(current.status, toStatus);
      const occurredAt = new Date();
      const auditEvent = {
        event: `APPROVAL_${toStatus}`,
        from_status: current.status,
        to_status: toStatus,
        occurred_at: occurredAt.toISOString(),
        decision_note: decisionNote || null,
          user_id: ownerId,
      };
      const claimed = await transaction.approvalRequest.updateMany({
        where: {
          id,
          userId: ownerId,
          status: current.status,
        },
        data: {
          ...updates,
          status: toStatus,
          decidedAt: toStatus === "PENDING" ? null : occurredAt,
          decisionNote: decisionNote || current.decisionNote || null,
          raw: appendAuditEvent(
            updates.raw
              ? { ...(current.raw || {}), ...updates.raw }
              : current.raw,
            auditEvent
          ),
        },
      });

      if (claimed.count !== 1) {
        throw createApprovalError(
          "Approval request changed while the decision was being saved."
        );
      }

      if (toStatus === "APPROVED" || toStatus === "REJECTED") {
        const orderCreated = await transaction.transactionLedger.count({
          where: {
            userId: ownerId,
            orderId: current.id,
            eventType: "ORDER_CREATED",
          },
        });
        await ledgerRepository.appendEvents(transaction, ownerId, [
          ...(orderCreated === 0
            ? [
                {
                  eventType: "ORDER_CREATED",
                  orderId: current.id,
                  approvalId: current.id,
                  symbol: current.symbol,
                  quantity: current.quantity,
                  price: current.entryPrice,
                  metadata: {
                    side: current.side,
                    approvalMode: current.approvalMode,
                    source: "LEGACY_APPROVAL_BACKFILL",
                  },
                },
              ]
            : []),
          {
            eventType:
              toStatus === "APPROVED"
                ? "ORDER_APPROVED"
                : "ORDER_REJECTED",
            orderId: current.id,
            approvalId: current.id,
            symbol: current.symbol,
            quantity: current.quantity,
            price: current.entryPrice,
            metadata: {
              fromStatus: current.status,
              toStatus,
              decisionNote: decisionNote || null,
            },
          },
        ]);
      }

      return transaction.approvalRequest.findFirst({
        where: ownedWhere(ownerId, { id }),
      });
    })
  );
}

module.exports = {
  ALLOWED_TRANSITIONS,
  appendAuditEvent,
  assertAllowedTransition,
  requireApprovedApprovalForExecution,
  transitionApprovalRequest,
};
