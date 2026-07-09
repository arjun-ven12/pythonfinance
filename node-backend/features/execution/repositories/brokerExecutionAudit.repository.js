function createBrokerExecutionAuditRepository({ prisma }) {
  async function create({
    userId,
    approvalId = null,
    symbol,
    side,
    quantity,
    mode,
    allowed,
    blockedReason = null,
    requestPayload = null,
    brokerResponse = null,
  }) {
    return prisma.run((db) =>
      db.brokerExecutionAudit.create({
        data: {
          userId,
          approvalId,
          symbol,
          side,
          quantity,
          mode,
          allowed: Boolean(allowed),
          blockedReason,
          requestPayload,
          brokerResponse,
        },
      })
    );
  }

  return {
    create,
  };
}

module.exports = createBrokerExecutionAuditRepository;
