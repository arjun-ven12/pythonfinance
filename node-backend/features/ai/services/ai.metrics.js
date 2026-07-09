function createAiMetricsService() {
  const counters = {
    requests: 0,
    successes: 0,
    failures: 0,
  };
  const byFeature = new Map();

  function ensureFeature(featureType) {
    if (!byFeature.has(featureType)) {
      byFeature.set(featureType, {
        requests: 0,
        successes: 0,
        failures: 0,
        totalLatencyMs: 0,
      });
    }
    return byFeature.get(featureType);
  }

  function record(featureType, { success, latencyMs = 0 } = {}) {
    counters.requests += 1;
    const feature = ensureFeature(featureType || "unknown");
    feature.requests += 1;
    feature.totalLatencyMs += Number.isFinite(latencyMs) ? latencyMs : 0;

    if (success) {
      counters.successes += 1;
      feature.successes += 1;
    } else {
      counters.failures += 1;
      feature.failures += 1;
    }
  }

  return {
    recordSuccess(featureType, latencyMs) {
      record(featureType, { success: true, latencyMs });
    },

    recordFailure(featureType, latencyMs) {
      record(featureType, { success: false, latencyMs });
    },

    snapshot() {
      return {
        totals: { ...counters },
        byFeature: Object.fromEntries(
          Array.from(byFeature.entries()).map(([featureType, entry]) => [
            featureType,
            {
              ...entry,
              averageLatencyMs:
                entry.requests > 0 ? Math.round(entry.totalLatencyMs / entry.requests) : 0,
            },
          ])
        ),
      };
    },
  };
}

module.exports = {
  createAiMetricsService,
};
