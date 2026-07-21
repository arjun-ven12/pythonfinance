const { evaluateEmbeddingEligibility } = require("./memoryEmbeddingEligibility");
const { buildMemoryDocument } = require("./memoryDocumentBuilder");

const MEMORY_SELECT = Object.freeze({
  id: true,
  userId: true,
  category: true,
  eventType: true,
  title: true,
  summary: true,
  structuredData: true,
  importance: true,
  occurredAt: true,
  retentionState: true,
  excludedFromAi: true,
  contentHash: true,
  schemaVersion: true,
  links: { select: { entityType: true, entityId: true, relationshipType: true } },
});

function createMemoryEmbeddingService({ prisma, config, provider, vectorRepository, logger = console } = {}) {
  if (!prisma?.run || !config || !provider || !vectorRepository) {
    throw new Error("Memory embedding service dependencies are required.");
  }

  const metrics = {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    stale: 0,
    excluded: 0,
    duplicatesSkipped: 0,
    queueLagMs: 0,
  };
  let timer = null;
  let tickRunning = false;

  async function loadMemory(memoryEventId, userId = null) {
    return prisma.run((db) => db.memoryEvent.findFirst({
      where: {
        id: String(memoryEventId),
        ...(userId ? { userId: String(userId) } : {}),
      },
      select: MEMORY_SELECT,
    }));
  }

  async function setExcluded(memory, reason) {
    const existing = await vectorRepository.getByMemory(memory.userId, memory.id);
    if (existing) {
      await prisma.run((db) => db.memoryEmbedding.update({
        where: { memoryEventId: memory.id },
        data: { lastErrorCategory: reason, status: "EXCLUDED", nextAttemptAt: null },
      }));
      await vectorRepository.clearVector(memory.userId, memory.id, "EXCLUDED");
    } else if (config.enabled) {
      await prisma.run((db) => db.memoryEmbedding.create({
        data: {
          userId: memory.userId,
          memoryEventId: memory.id,
          embeddingProvider: config.provider,
          embeddingModel: config.model,
          embeddingVersion: config.embeddingVersion,
          documentBuilderVersion: config.documentBuilderVersion,
          dimensions: config.dimensions,
          sourceContentHash: memory.contentHash,
          status: "EXCLUDED",
          lastErrorCategory: reason,
        },
      }));
    }
    metrics.excluded += 1;
    return { queued: false, reason };
  }

  async function enqueueMemory(memoryEventId, { userId = null, force = false } = {}) {
    if (!config.enabled) return { queued: false, reason: "EMBEDDING_DISABLED" };
    const memory = await loadMemory(memoryEventId, userId);
    if (!memory) return { queued: false, reason: "MEMORY_NOT_FOUND" };
    const eligibility = evaluateEmbeddingEligibility(memory, config);
    if (!eligibility.eligible) return setExcluded(memory, eligibility.reason);

    let built;
    try {
      built = buildMemoryDocument(memory, { builderVersion: config.documentBuilderVersion });
    } catch (error) {
      return setExcluded(memory, error.code || "DOCUMENT_REDACTION_FAILED");
    }

    const existing = await vectorRepository.getByMemory(memory.userId, memory.id);
    const unchanged = existing
      && existing.status === "COMPLETED"
      && existing.sourceContentHash === built.sourceContentHash
      && existing.embeddingProvider === config.provider
      && existing.embeddingModel === config.model
      && existing.embeddingVersion === config.embeddingVersion
      && existing.documentBuilderVersion === config.documentBuilderVersion
      && existing.dimensions === config.dimensions;
    if (unchanged && !force) {
      metrics.duplicatesSkipped += 1;
      return { queued: false, reason: "UNCHANGED", embedding: existing };
    }

    const status = existing ? "STALE" : "PENDING";
    const embedding = await prisma.run((db) => db.memoryEmbedding.upsert({
      where: { memoryEventId: memory.id },
      create: {
        userId: memory.userId,
        memoryEventId: memory.id,
        embeddingProvider: config.provider,
        embeddingModel: config.model,
        embeddingVersion: config.embeddingVersion,
        documentBuilderVersion: config.documentBuilderVersion,
        dimensions: config.dimensions,
        sourceContentHash: built.sourceContentHash,
        documentPreview: built.preview,
        status,
      },
      update: {
        embeddingProvider: config.provider,
        embeddingModel: config.model,
        embeddingVersion: config.embeddingVersion,
        documentBuilderVersion: config.documentBuilderVersion,
        dimensions: config.dimensions,
        sourceContentHash: built.sourceContentHash,
        documentPreview: built.preview,
        status,
        attemptCount: force ? 0 : undefined,
        lastErrorCategory: null,
        nextAttemptAt: null,
        claimToken: null,
        claimedAt: null,
      },
      select: { id: true, memoryEventId: true, status: true },
    }));
    if (existing) {
      await vectorRepository.clearVector(memory.userId, memory.id, "STALE");
      metrics.stale += 1;
    }
    metrics.queued += 1;
    return { queued: true, embedding };
  }

  async function markFailure(job, error) {
    const permanent = job.attemptCount >= config.maxAttempts;
    const delay = config.retryBaseMs * 2 ** Math.max(0, job.attemptCount - 1);
    await prisma.run((db) => db.memoryEmbedding.updateMany({
      where: { id: job.id, userId: job.userId, claimToken: job.claimToken },
      data: {
        status: "FAILED",
        lastErrorCategory: String(error?.code || "PROVIDER").slice(0, 80),
        nextAttemptAt: permanent ? null : new Date(Date.now() + delay),
        claimToken: null,
        claimedAt: null,
      },
    }));
    metrics.failed += 1;
    logger.warn?.("memory_embedding_failed", {
      memoryEventId: job.memoryEventId,
      category: error?.code || "PROVIDER",
      attemptCount: job.attemptCount,
      permanent,
    });
  }

  async function processClaimed(jobs) {
    const ready = [];
    for (const job of jobs) {
      const memory = await loadMemory(job.memoryEventId, job.userId);
      const eligibility = evaluateEmbeddingEligibility(memory, config);
      if (!eligibility.eligible) {
        if (memory) await setExcluded(memory, eligibility.reason);
        continue;
      }
      try {
        const built = buildMemoryDocument(memory, { builderVersion: config.documentBuilderVersion });
        await prisma.run((db) => db.memoryEmbedding.updateMany({
          where: { id: job.id, userId: job.userId, claimToken: job.claimToken },
          data: {
            embeddingProvider: config.provider,
            embeddingModel: config.model,
            embeddingVersion: config.embeddingVersion,
            documentBuilderVersion: config.documentBuilderVersion,
            dimensions: config.dimensions,
            sourceContentHash: built.sourceContentHash,
            documentPreview: built.preview,
          },
        }));
        ready.push({ job, memory, built });
      } catch (error) {
        await markFailure(job, error);
      }
    }
    if (!ready.length) return [];

    let response;
    try {
      const userIds = [...new Set(ready.map((item) => item.job.userId).filter(Boolean))];
      response = await provider.embed(ready.map((item) => item.built.document), {
        userId: userIds.length === 1 ? userIds[0] : null,
        userIds,
        featureType: "memoryEmbeddingBatch",
        section: "retrievedMemories",
        promptVersion: config.embeddingVersion,
      });
    } catch (error) {
      await Promise.all(ready.map((item) => markFailure(item.job, error)));
      return [];
    }

    const completed = [];
    for (let index = 0; index < ready.length; index += 1) {
      const item = ready[index];
      const updated = await vectorRepository.storeVector({
        userId: item.job.userId,
        memoryEventId: item.job.memoryEventId,
        claimToken: item.job.claimToken,
        vector: response.vectors[index],
        sourceContentHash: item.built.sourceContentHash,
      });
      if (updated === 1) {
        metrics.completed += 1;
        metrics.queueLagMs += Math.max(0, Date.now() - new Date(item.job.createdAt || item.memory.occurredAt).getTime());
        completed.push(item.job.memoryEventId);
      }
    }
    return completed;
  }

  async function processBatch({ limit = config.batchSize } = {}) {
    if (!config.enabled || !provider.isConfigured()) return { claimed: 0, completed: 0 };
    const jobs = await vectorRepository.claimBatch({
      limit: Math.min(config.batchSize, Math.max(1, Number(limit) || config.batchSize)),
      maxAttempts: config.maxAttempts,
      leaseMs: config.leaseMs,
    });
    if (!jobs.length) return { claimed: 0, completed: 0 };
    metrics.processing += jobs.length;
    try {
      const completed = await processClaimed(jobs);
      return { claimed: jobs.length, completed: completed.length };
    } finally {
      metrics.processing -= jobs.length;
    }
  }

  async function tick() {
    if (tickRunning) return;
    tickRunning = true;
    try {
      await Promise.all(Array.from({ length: config.maxConcurrency }, () => processBatch()));
    } catch (error) {
      logger.warn?.("memory_embedding_worker_failed", { error: error.message });
    } finally {
      tickRunning = false;
    }
  }

  function start() {
    if (!config.enabled || timer) return false;
    void tick();
    timer = setInterval(() => void tick(), config.pollIntervalMs);
    timer.unref?.();
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function markStale(memoryEventId, userId) {
    const memory = await loadMemory(memoryEventId, userId);
    if (!memory) return { updated: false };
    const existing = await vectorRepository.getByMemory(memory.userId, memory.id);
    if (!existing) return enqueueMemory(memory.id, { userId: memory.userId });
    await vectorRepository.clearVector(memory.userId, memory.id, "STALE");
    await prisma.run((db) => db.memoryEmbedding.update({
      where: { memoryEventId: memory.id },
      data: { nextAttemptAt: null, lastErrorCategory: "SOURCE_CHANGED" },
    }));
    metrics.stale += 1;
    return { updated: true };
  }

  async function excludeMemory(memoryEventId, userId) {
    const memory = await loadMemory(memoryEventId, userId);
    if (!memory) return { updated: false };
    return setExcluded(memory, "EXCLUDED_FROM_AI");
  }

  async function diagnostics(userId = null) {
    return {
      enabled: config.enabled,
      workerRunning: Boolean(timer),
      configuration: {
        provider: config.provider,
        model: config.model,
        dimensions: config.dimensions,
        embeddingVersion: config.embeddingVersion,
        documentBuilderVersion: config.documentBuilderVersion,
        batchSize: config.batchSize,
        maxConcurrency: config.maxConcurrency,
        minImportance: config.minImportance,
      },
      jobs: {
        ...metrics,
        averageQueueLagMs: metrics.completed ? Math.round(metrics.queueLagMs / metrics.completed) : 0,
      },
      provider: provider.diagnostics(),
      storage: await vectorRepository.diagnostics(userId),
    };
  }

  return {
    diagnostics,
    enqueueMemories: (ids = []) => Promise.all(ids.slice(0, 100).map((id) => enqueueMemory(id))),
    enqueueMemory,
    excludeMemory,
    getEmbeddingStatus: vectorRepository.getByMemory,
    markStale,
    processBatch,
    rebuildMemory: (id, userId) => enqueueMemory(id, { userId, force: true }),
    reembedMemory: (id, userId) => enqueueMemory(id, { userId, force: true }),
    start,
    stop,
    tick,
  };
}

module.exports = { MEMORY_SELECT, createMemoryEmbeddingService };
