const { ownedWhere, requireUserId } = require("../../../repositories/ownership");

function createBrokerOrdersRepository({ prisma, memoryIngestionService = null }) {
  function recordAfterCommit(buildEvent, record) {
    if (!memoryIngestionService) return;
    const timer = setTimeout(async () => {
      let result = await memoryIngestionService.recordEvent(buildEvent(record));
      if (result?.error) result = await new Promise((resolve) => { const retry = setTimeout(() => resolve(memoryIngestionService.recordEvent(buildEvent(record))), 100); retry.unref?.(); });
      return result;
    }, 0);
    timer.unref?.();
  }
  function normalizeBrokerFilter(broker) {
    const normalized = String(broker || "").trim().toUpperCase();
    return normalized || null;
  }

  function listOrders(userId, options = {}) {
    const ownerId = requireUserId(userId);
    const broker = normalizeBrokerFilter(options.broker);
    return prisma.run((db) =>
      db.brokerOrder.findMany({
        where: ownedWhere(ownerId, {
          ...(broker ? { broker } : {}),
          ...(options.status ? { status: options.status } : {}),
          ...(options.statusIn?.length ? { status: { in: options.statusIn } } : {}),
        }),
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        include: {
          fills: {
            orderBy: { filledAt: "desc" },
          },
          events: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
        take: options.limit || 100,
      })
    );
  }

  function findByBrokerOrderIds(userId, brokerOrderIds = []) {
    const ownerId = requireUserId(userId);
    const normalizedIds = brokerOrderIds
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (!normalizedIds.length) {
      return Promise.resolve([]);
    }
    return prisma.run((db) =>
      db.brokerOrder.findMany({
        where: ownedWhere(ownerId, {
          brokerOrderId: { in: normalizedIds },
        }),
        include: {
          fills: { orderBy: { filledAt: "desc" } },
          events: { orderBy: { createdAt: "desc" } },
        },
      })
    );
  }

  function listFills(userId, options = {}) {
    const ownerId = requireUserId(userId);
    const broker = normalizeBrokerFilter(options.broker);
    return prisma.run((db) =>
      db.brokerFill.findMany({
        where: ownedWhere(ownerId, {
          ...(broker
            ? {
                brokerOrder: {
                  broker,
                },
              }
            : {}),
        }),
        include: {
          brokerOrder: true,
        },
        orderBy: [{ filledAt: "desc" }, { createdAt: "desc" }],
        take: options.limit || 100,
      })
    );
  }

  function getOrderById(userId, id) {
    const ownerId = requireUserId(userId);
    return prisma.run((db) =>
      db.brokerOrder.findFirst({
        where: ownedWhere(ownerId, { id }),
        include: {
          fills: { orderBy: { filledAt: "desc" } },
          events: { orderBy: { createdAt: "desc" } },
        },
      })
    );
  }

  function findByApprovalId(userId, approvalId) {
    const ownerId = requireUserId(userId);
    return prisma.run((db) =>
      db.brokerOrder.findFirst({
        where: ownedWhere(ownerId, { approvalId }),
        orderBy: { createdAt: "desc" },
        include: {
          fills: true,
          events: { orderBy: { createdAt: "desc" } },
        },
      })
    );
  }

  function findByClientOrderId(userId, clientOrderId) {
    const ownerId = requireUserId(userId);
    return prisma.run((db) =>
      db.brokerOrder.findFirst({
        where: {
          userId: ownerId,
          clientOrderId,
        },
      })
    );
  }

  function findByBrokerOrderId(userId, brokerOrderId) {
    const ownerId = requireUserId(userId);
    return prisma.run((db) =>
      db.brokerOrder.findFirst({
        where: {
          userId: ownerId,
          brokerOrderId: String(brokerOrderId || ""),
        },
        include: {
          fills: true,
          events: { orderBy: { createdAt: "desc" } },
        },
      })
    );
  }

  async function createSubmittedOrder(transaction, payload) {
    const order = await transaction.brokerOrder.create({
      data: payload,
    });
    if (memoryIngestionService) { const { brokerOrderEvent } = require("../../memory/services/memoryEvents"); recordAfterCommit(brokerOrderEvent, order); }
    return order;
  }

  async function appendEvent(transaction, userId, brokerOrderId, eventType, payload = null) {
    const ownerId = requireUserId(userId);
    return transaction.brokerOrderEvent.create({
      data: {
        userId: ownerId,
        brokerOrderId,
        eventType,
        payload,
      },
    });
  }

  async function updateOrder(transaction, userId, id, data) {
    const ownerId = requireUserId(userId);
    const previous = await transaction.brokerOrder.findFirst({
      where: { id, userId: ownerId },
      select: { status: true, filledQuantity: true },
    });
    const result = await transaction.brokerOrder.updateMany({
      where: {
        id,
        userId: ownerId,
      },
      data,
    });
    if (result.count !== 1) {
      const error = new Error("Broker order not found for update.");
      error.statusCode = 404;
      throw error;
    }
    const updated = await transaction.brokerOrder.findFirst({
      where: { id, userId: ownerId },
      include: {
        fills: true,
        events: { orderBy: { createdAt: "desc" } },
      },
    });
    const statusChanged = previous && String(previous.status) !== String(updated?.status);
    const fillChanged = previous && Number(previous.filledQuantity || 0) !== Number(updated?.filledQuantity || 0);
    if (memoryIngestionService && updated && (statusChanged || fillChanged)) {
      const { brokerOrderTransitionEvent } = require("../../memory/services/memoryEvents");
      recordAfterCommit((record) => brokerOrderTransitionEvent(record, previous.status), updated);
    }
    return updated;
  }

  async function upsertFill(transaction, userId, payload) {
    const ownerId = requireUserId(userId);
    if (payload.executionId) {
      const fill = await transaction.brokerFill.upsert({
        where: {
          userId_executionId: {
            userId: ownerId,
            executionId: payload.executionId,
          },
        },
        update: {
          quantity: payload.quantity,
          price: payload.price,
          commission: payload.commission,
          filledAt: payload.filledAt,
          raw: payload.raw || null,
        },
        create: {
          ...payload,
          userId: ownerId,
        },
      });
      if (memoryIngestionService) { const { brokerFillEvent } = require("../../memory/services/memoryEvents"); recordAfterCommit(brokerFillEvent, fill); }
      return fill;
    }

    const fill = await transaction.brokerFill.create({
      data: {
        ...payload,
        userId: ownerId,
      },
    });
    if (memoryIngestionService) { const { brokerFillEvent } = require("../../memory/services/memoryEvents"); recordAfterCommit(brokerFillEvent, fill); }
    return fill;
  }

  return {
    appendEvent,
    createSubmittedOrder,
    findByApprovalId,
    findByBrokerOrderIds,
    findByBrokerOrderId,
    findByClientOrderId,
    getOrderById,
    listFills,
    listOrders,
    updateOrder,
    upsertFill,
  };
}

module.exports = createBrokerOrdersRepository;
