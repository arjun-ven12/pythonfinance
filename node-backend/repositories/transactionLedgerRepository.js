const crypto = require("node:crypto");
const { requireUserId } = require("./ownership");

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }

  return value;
}

function numberString(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ledger number: ${value}`);
  }
  return parsed.toFixed(8);
}

function hashEvent(previousHash, event, occurredAt, hashVersion = 2) {
  const payload =
    hashVersion === 1
      ? stableValue({
          userId: event.userId,
          type: event.type,
          symbol: event.symbol || null,
          quantity: numberString(event.quantity),
          price: numberString(event.price),
          cashDelta: numberString(event.cashDelta || 0),
          positionDelta: numberString(event.positionDelta || 0),
          tradeId: event.tradeId || null,
          approvalId: event.approvalId || null,
          metadata: event.metadata || null,
          createdAt: occurredAt.toISOString(),
        })
      : stableValue({
          userId: event.userId,
          eventType: event.eventType,
          occurredAt: occurredAt.toISOString(),
          orderId: event.orderId || null,
          executionId: event.executionId || null,
          approvalId: event.approvalId || null,
          symbol: event.symbol || null,
          quantity: numberString(event.quantity),
          price: numberString(event.price),
          fee: numberString(event.fee || 0),
          cashDelta: numberString(event.cashDelta || 0),
          positionDelta: numberString(event.positionDelta || 0),
          currency: event.currency || "USD",
          metadata: event.metadata || null,
        });

  return crypto
    .createHash("sha256")
    .update(`${previousHash || ""}${JSON.stringify(payload)}`)
    .digest("hex");
}

async function lockUserChain(transaction, userId) {
  if (typeof transaction.$executeRaw === "function") {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${userId}))
    `;
  }
}

async function appendEvents(transaction, userId, events) {
  const ownerId = requireUserId(userId);
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  await lockUserChain(transaction, ownerId);
  const latest = await transaction.transactionLedger.findFirst({
    where: { userId: ownerId },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
  });
  let previousHash = latest?.eventHash || null;
  const minimumOccurredAt = latest
    ? new Date(latest.occurredAt).getTime() + 1
    : 0;
  const created = [];

  for (let index = 0; index < events.length; index += 1) {
    const input = events[index];
    const baseOccurredAt = input.occurredAt
      ? new Date(input.occurredAt)
      : new Date();
    const occurredAt = new Date(
      Math.max(baseOccurredAt.getTime() + index, minimumOccurredAt + index)
    );
    const metadata = {
      ...(input.metadata || {}),
      hashVersion: 2,
    };
    const event = {
      userId: ownerId,
      eventType: input.eventType,
      orderId: input.orderId || null,
      executionId: input.executionId || null,
      approvalId: input.approvalId || null,
      symbol: input.symbol ? String(input.symbol).toUpperCase() : null,
      quantity: numberString(input.quantity),
      price: numberString(input.price),
      fee: numberString(input.fee || 0),
      cashDelta: numberString(input.cashDelta || 0),
      positionDelta: numberString(input.positionDelta || 0),
      currency: String(input.currency || "USD").toUpperCase(),
      metadata,
    };
    const eventHash = hashEvent(previousHash, event, occurredAt, 2);
    const row = await transaction.transactionLedger.create({
      data: {
        ...event,
        previousHash,
        eventHash,
        occurredAt,
      },
    });
    created.push(row);
    previousHash = eventHash;
  }

  return created;
}

function listEvents(transaction, userId) {
  return transaction.transactionLedger.findMany({
    where: { userId: requireUserId(userId) },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
  });
}

function legacyMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return metadata || null;
  const { hashVersion: _hashVersion, legacyEventType: _legacyType, ...rest } =
    metadata;
  return rest;
}

async function verifyHashChain(transaction, userId) {
  const events = await listEvents(transaction, userId);
  let previousHash = null;

  for (const event of events) {
    const hashVersion = Number(event.metadata?.hashVersion || 1);
    const expectedHash = hashEvent(
      previousHash,
      hashVersion === 1
        ? {
            userId: event.userId,
            type: event.metadata?.legacyEventType,
            symbol: event.symbol,
            quantity: event.quantity,
            price: event.price,
            cashDelta: event.cashDelta,
            positionDelta: event.positionDelta,
            tradeId: event.executionId,
            approvalId: event.approvalId,
            metadata: legacyMetadata(event.metadata),
          }
        : {
            userId: event.userId,
            eventType: event.eventType,
            orderId: event.orderId,
            executionId: event.executionId,
            approvalId: event.approvalId,
            symbol: event.symbol,
            quantity: event.quantity,
            price: event.price,
            fee: event.fee,
            cashDelta: event.cashDelta,
            positionDelta: event.positionDelta,
            currency: event.currency,
            metadata: event.metadata,
          },
      event.occurredAt,
      hashVersion
    );

    if (event.previousHash !== previousHash || event.eventHash !== expectedHash) {
      return {
        valid: false,
        corruptedEventId: event.id,
        expectedHash,
        actualHash: event.eventHash,
      };
    }
    previousHash = event.eventHash;
  }

  return {
    valid: true,
    eventCount: events.length,
    lastHash: previousHash,
  };
}

module.exports = {
  appendEvents,
  hashEvent,
  listEvents,
  lockUserChain,
  verifyHashChain,
};
