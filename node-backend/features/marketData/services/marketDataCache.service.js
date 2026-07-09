function createMarketDataCacheService({
  memory,
  redis,
  metrics,
} = {}) {
  const inFlight = new Map();

  async function get(key) {
    const memoryEntry = memory?.get(key);
    if (memoryEntry) {
      metrics?.increment("memoryHits");
      metrics?.setGauge("memoryEntries", memory?.size?.() || 0);
      return memoryEntry.value;
    }

    metrics?.increment("memoryMisses");

    if (!redis?.enabled) {
      return null;
    }

    const redisEntry = await redis.get(key);
    if (!redisEntry) {
      metrics?.increment("redisMisses");
      return null;
    }

    metrics?.increment("redisHits");
    memory?.set(key, redisEntry.value, redisEntry.expiresAt ? redisEntry.expiresAt - Date.now() : 0);
    metrics?.setGauge("memoryEntries", memory?.size?.() || 0);
    return redisEntry.value;
  }

  async function set(key, value, ttlMs) {
    memory?.set(key, value, ttlMs);
    metrics?.setGauge("memoryEntries", memory?.size?.() || 0);
    if (redis?.enabled) {
      await redis.set(key, value, ttlMs);
    }
    return value;
  }

  async function memoize(key, loader) {
    if (inFlight.has(key)) {
      metrics?.increment("dedupedRequests");
      return inFlight.get(key);
    }

    const promise = Promise.resolve()
      .then(loader)
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  }

  async function deleteKey(key) {
    memory?.delete?.(key);
    if (redis?.enabled) {
      await redis.delete(key);
    }
  }

  return {
    delete: deleteKey,
    get,
    memoize,
    set,
  };
}

module.exports = createMarketDataCacheService;
