const { ownedWhere, requireUserId } = require("../../../repositories/ownership");

function createBrokerOrdersRepository({ prisma }) {
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
    return transaction.brokerOrder.create({
      data: payload,
    });
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
    return transaction.brokerOrder.findFirst({
      where: { id, userId: ownerId },
      include: {
        fills: true,
        events: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  async function upsertFill(transaction, userId, payload) {
    const ownerId = requireUserId(userId);
    if (payload.executionId) {
      return transaction.brokerFill.upsert({
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
    }

    return transaction.brokerFill.create({
      data: {
        ...payload,
        userId: ownerId,
      },
    });
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
