const channels = new Map();
let sessionChangeListenerAttached = false;

function getChannelEntry(channel) {
  if (!channels.has(channel)) {
    channels.set(channel, {
      listeners: new Set(),
      intervalMs: 0,
      intervalId: null,
      refreshOnSessionChange: false,
    });
  }
  return channels.get(channel);
}

function emitChannel(channel, payload = {}) {
  const entry = channels.get(channel);
  if (!entry) return;
  entry.listeners.forEach((listener) => {
    try {
      listener({
        channel,
        ...payload,
      });
    } catch (_error) {
      // Listener failures should not break shared refresh fanout.
    }
  });
}

function ensureSessionChangeListener() {
  if (sessionChangeListenerAttached || typeof window === "undefined") {
    return;
  }

  window.addEventListener("trading-dashboard:trading-session-changed", (event) => {
    const detail = event?.detail || {};
    const reason =
      detail?.source === "auto-broker-reconciliation-sync"
        ? "synchronization"
        : detail?.provider
          ? "provider-switch"
          : "session-change";

    channels.forEach((entry, channel) => {
      if (!entry.refreshOnSessionChange || entry.listeners.size === 0) {
        return;
      }
      emitChannel(channel, { reason, detail });
    });
  });

  sessionChangeListenerAttached = true;
}

export function subscribeBrokerRefreshChannel(
  channel,
  listener,
  {
    enabled = true,
    immediate = true,
    intervalMs = 0,
    refreshOnSessionChange = false,
  } = {}
) {
  if (!enabled || typeof listener !== "function") {
    return () => {};
  }

  ensureSessionChangeListener();
  const entry = getChannelEntry(channel);
  entry.listeners.add(listener);
  entry.refreshOnSessionChange =
    entry.refreshOnSessionChange || Boolean(refreshOnSessionChange);

  if (intervalMs > 0) {
    if (!entry.intervalId || entry.intervalMs !== intervalMs) {
      window.clearInterval(entry.intervalId);
      entry.intervalMs = intervalMs;
      entry.intervalId = window.setInterval(() => {
        emitChannel(channel, { reason: "scheduled" });
      }, intervalMs);
    }
  }

  if (immediate) {
    window.setTimeout(() => {
      if (entry.listeners.has(listener)) {
        listener({ channel, reason: "initial" });
      }
    }, 0);
  }

  return () => {
    const current = channels.get(channel);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      window.clearInterval(current.intervalId);
      channels.delete(channel);
    }
  };
}

export function emitBrokerRefreshChannel(channel, payload = {}) {
  emitChannel(channel, payload);
}

export function __resetBrokerRefreshCoordinatorForTests() {
  channels.forEach((entry) => {
    window.clearInterval(entry.intervalId);
  });
  channels.clear();
  sessionChangeListenerAttached = false;
}
