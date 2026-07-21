const channels = new Map();
let paused = false;

function notify(entry, event) {
  entry.subscribers.forEach((subscriber) => subscriber(event));
}

function tick(name, reason) {
  const entry = channels.get(name);
  if (!entry || paused || entry.running) return;
  entry.running = true;
  Promise.resolve(entry.poll({ channel: name, reason }))
    .then((data) => notify(entry, { channel: name, reason, data }))
    .catch((error) => notify(entry, { channel: name, reason, error }))
    .finally(() => {
      entry.running = false;
    });
}

export function subscribePollingChannel(name, subscriber, {
  immediate = true,
  intervalMs,
  poll,
} = {}) {
  if (!name || typeof subscriber !== "function" || typeof poll !== "function") return () => {};
  let entry = channels.get(name);
  if (!entry) {
    entry = {
      intervalId: null,
      intervalMs,
      poll,
      running: false,
      subscribers: new Set(),
    };
    channels.set(name, entry);
    if (intervalMs > 0) {
      entry.intervalId = window.setInterval(() => tick(name, "scheduled"), intervalMs);
    }
  }
  entry.subscribers.add(subscriber);
  if (immediate) queueMicrotask(() => tick(name, "initial"));

  return () => {
    const current = channels.get(name);
    current?.subscribers.delete(subscriber);
    if (current && current.subscribers.size === 0) {
      window.clearInterval(current.intervalId);
      channels.delete(name);
    }
  };
}

export function refreshPollingChannel(name) {
  tick(name, "event");
}

export function pausePolling() {
  paused = true;
}

export function resumePolling({ refresh = true } = {}) {
  paused = false;
  if (refresh) channels.forEach((_entry, name) => tick(name, "resume"));
}

export function getPollingDiagnostics() {
  return {
    activeChannels: channels.size,
    activeSubscribers: [...channels.values()].reduce(
      (total, entry) => total + entry.subscribers.size,
      0
    ),
    paused,
  };
}

export function __resetPollingCoordinatorForTests() {
  channels.forEach((entry) => window.clearInterval(entry.intervalId));
  channels.clear();
  paused = false;
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  Object.defineProperty(window, "__POLLING_DIAGNOSTICS__", {
    configurable: true,
    get: getPollingDiagnostics,
  });
}
