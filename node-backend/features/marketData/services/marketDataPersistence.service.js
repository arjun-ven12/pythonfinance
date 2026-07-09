function sanitizeKeyPart(value, fallback = "") {
  const normalized = value == null ? fallback : String(value).trim();
  return normalized || fallback;
}

function createMarketDataPersistenceService({
  flushIntervalMs = Number(process.env.MARKET_CACHE_FLUSH_INTERVAL_MS || 60_000),
  metrics,
  prisma,
} = {}) {
  const dirtyEntries = new Map();
  let flushTimer = null;
  let persistenceDisabled = false;

  function buildKey(entry) {
    return [
      sanitizeKeyPart(entry.userId),
      sanitizeKeyPart(entry.symbol),
      sanitizeKeyPart(entry.scope),
      sanitizeKeyPart(entry.rangeKey, "QUOTE"),
      sanitizeKeyPart(entry.timeframeKey, ""),
    ].join(":");
  }

  function hasPersistenceModel(db) {
    return Boolean(db && db.marketDataSnapshot && typeof db.marketDataSnapshot.upsert === "function");
  }

  function isMissingSnapshotTableError(error) {
    return (
      error?.code === "P2021" ||
      /MarketDataSnapshot.*does not exist/i.test(String(error?.message || "")) ||
      /table .*MarketDataSnapshot.* does not exist/i.test(String(error?.message || ""))
    );
  }

  function markDirty(entry) {
    if (!entry?.userId || !entry?.symbol || !entry?.payload) {
      return;
    }

    dirtyEntries.set(buildKey(entry), {
      ...entry,
      rangeKey: sanitizeKeyPart(entry.rangeKey, "QUOTE"),
      timeframeKey: sanitizeKeyPart(entry.timeframeKey, ""),
    });
  }

  async function flush() {
    if (!prisma || persistenceDisabled || dirtyEntries.size === 0) {
      return { flushed: 0, skipped: dirtyEntries.size };
    }

    const entries = [...dirtyEntries.values()];
    dirtyEntries.clear();

    try {
      await prisma.run(async (db) => {
        if (!hasPersistenceModel(db)) {
          return;
        }

        for (const entry of entries) {
          await db.marketDataSnapshot.upsert({
            where: {
              userId_symbol_scope_rangeKey_timeframeKey: {
                userId: entry.userId,
                symbol: entry.symbol,
                scope: entry.scope,
                rangeKey: entry.rangeKey,
                timeframeKey: entry.timeframeKey,
              },
            },
            update: {
              market: entry.market || null,
              currency: entry.currency || null,
              interval: entry.interval || null,
              provider: entry.provider || null,
              source: entry.source || null,
              lastUpdated: entry.lastUpdated ? new Date(entry.lastUpdated) : null,
              payload: entry.payload,
            },
            create: {
              userId: entry.userId,
              symbol: entry.symbol,
              scope: entry.scope,
              rangeKey: entry.rangeKey,
              timeframeKey: entry.timeframeKey,
              market: entry.market || null,
              currency: entry.currency || null,
              interval: entry.interval || null,
              provider: entry.provider || null,
              source: entry.source || null,
              lastUpdated: entry.lastUpdated ? new Date(entry.lastUpdated) : null,
              payload: entry.payload,
            },
          });
        }
      });

      metrics?.setGauge("lastFlushAt", new Date().toISOString());
      metrics?.setGauge("flushedRows", entries.length);
      return { flushed: entries.length, skipped: 0 };
    } catch (error) {
      if (isMissingSnapshotTableError(error)) {
        persistenceDisabled = true;
        metrics?.setGauge("persistenceAvailable", false);
        metrics?.setGauge("skippedRows", entries.length);
        return { flushed: 0, skipped: entries.length, disabled: true };
      }

      for (const entry of entries) {
        dirtyEntries.set(buildKey(entry), entry);
      }
      metrics?.setGauge("failedFlushes", (metrics?.getSnapshot?.().gauges?.failedFlushes || 0) + 1);
      throw error;
    }
  }

  function start() {
    if (flushTimer || !Number.isFinite(Number(flushIntervalMs)) || Number(flushIntervalMs) <= 0) {
      return;
    }

    flushTimer = setInterval(() => {
      flush().catch((error) => {
        console.warn(`Market-data snapshot flush failed: ${error.message}`);
      });
    }, Number(flushIntervalMs));

    if (typeof flushTimer.unref === "function") {
      flushTimer.unref();
    }
  }

  async function stop() {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    await flush().catch(() => {});
  }

  return {
    flush,
    isMissingSnapshotTableError,
    markDirty,
    start,
    stop,
  };
}

module.exports = createMarketDataPersistenceService;
