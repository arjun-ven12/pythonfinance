function average(values = []) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function createMarketDataMetricsService() {
  const counters = {
    memoryHits: 0,
    memoryMisses: 0,
    redisHits: 0,
    redisMisses: 0,
    providerRequests: 0,
    dedupedRequests: 0,
    staleCacheCount: 0,
  };

  const providerLatencies = new Map();
  const gauges = {
    websocketSubscribers: 0,
    quoteSubscriptions: 0,
    historySubscriptions: 0,
    memoryEntries: 0,
    lastBatchSize: 0,
    averageBatchSize: 0,
    lastFlushAt: null,
    flushedRows: 0,
    failedFlushes: 0,
  };

  const batchSamples = [];

  function increment(name, amount = 1) {
    counters[name] = (counters[name] || 0) + amount;
  }

  function setGauge(name, value) {
    gauges[name] = value;
  }

  function recordProviderLatency(provider, latencyMs) {
    const key = String(provider || "UNKNOWN");
    const sample = {
      latencyMs: Number(latencyMs || 0),
      timestamp: new Date().toISOString(),
    };
    const current = providerLatencies.get(key) || [];
    current.push(sample);
    while (current.length > 50) {
      current.shift();
    }
    providerLatencies.set(key, current);
  }

  function recordBatchSize(size) {
    const normalized = Math.max(0, Number(size || 0));
    batchSamples.push(normalized);
    while (batchSamples.length > 100) {
      batchSamples.shift();
    }
    gauges.lastBatchSize = normalized;
    gauges.averageBatchSize = Number(average(batchSamples).toFixed(2));
  }

  function getSnapshot() {
    return {
      counters: { ...counters },
      gauges: { ...gauges },
      providerLatency: [...providerLatencies.entries()].map(([provider, samples]) => ({
        provider,
        lastLatencyMs: samples[samples.length - 1]?.latencyMs || 0,
        averageLatencyMs: Number(average(samples.map((sample) => sample.latencyMs)).toFixed(2)),
        sampleCount: samples.length,
        lastUpdated: samples[samples.length - 1]?.timestamp || null,
      })),
    };
  }

  return {
    getSnapshot,
    increment,
    recordBatchSize,
    recordProviderLatency,
    setGauge,
  };
}

module.exports = createMarketDataMetricsService;
