import { API_BASE_URL, apiFetch, readJson } from "../../../services/apiClient";

function buildRouteBase(isDemoMode) {
  return isDemoMode ? "/api/demo/market-data" : "/api/market-data";
}

function buildWsUrl() {
  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/market-data";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function buildQuoteKey(symbol, isDemoMode) {
  return `${isDemoMode ? "demo" : "app"}:quote:${String(symbol || "").toUpperCase()}`;
}

function buildHistoryKey(symbol, timeframe, isDemoMode) {
  return `${isDemoMode ? "demo" : "app"}:history:${String(symbol || "").toUpperCase()}:${timeframe}`;
}

export default class BackendMarketDataProvider {
  constructor() {
    this.connected = false;
    this.socket = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.quoteSubscriptions = new Map();
    this.candleSubscriptions = new Map();
    this.quoteInFlight = new Map();
    this.historyInFlight = new Map();
  }

  connect() {
    if (this.connected) return;
    this.connected = true;
    this.ensureSocket();
  }

  disconnect() {
    this.connected = false;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close(1000, "Client disconnect");
      this.socket = null;
    }
    this.quoteInFlight.clear();
    this.historyInFlight.clear();
    this.quoteSubscriptions.clear();
    this.candleSubscriptions.clear();
  }

  ensureSocket() {
    if (!this.connected || !this.hasLiveSubscriptions()) return;
    if (
      this.socket &&
      (this.socket.readyState === window.WebSocket.OPEN ||
        this.socket.readyState === window.WebSocket.CONNECTING)
    ) {
      return;
    }

    this.socket = new window.WebSocket(buildWsUrl());
    this.socket.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.resubscribeAll();
    });
    this.socket.addEventListener("message", (event) => {
      this.handleSocketMessage(event.data);
    });
    this.socket.addEventListener("close", () => {
      this.socket = null;
      if (this.connected && this.hasLiveSubscriptions()) {
        this.scheduleReconnect();
      }
    });
    this.socket.addEventListener("error", () => {
      if (this.socket?.readyState === window.WebSocket.OPEN) {
        return;
      }
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (!this.connected || this.reconnectTimer) return;
    const delay = Math.min(10_000, 1_000 * Math.max(1, this.reconnectAttempt + 1));
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureSocket();
    }, delay);
  }

  hasLiveSubscriptions() {
    return (
      [...this.quoteSubscriptions.values()].some((entry) => !entry.options?.isDemoMode) ||
      [...this.candleSubscriptions.values()].some((entry) => !entry.options?.isDemoMode)
    );
  }

  async fetchQuote(symbol, options = {}) {
    const routeBase = buildRouteBase(options.isDemoMode);
    const response = await apiFetch(
      `${API_BASE_URL}${routeBase}/${encodeURIComponent(symbol)}/quote`
    );
    return readJson(response);
  }

  async fetchQuotes(symbols = [], options = {}) {
    const unique = [...new Set(symbols.map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean))];
    if (unique.length === 0) {
      return [];
    }

    if (options.isDemoMode) {
      return Promise.all(unique.map((symbol) => this.fetchQuote(symbol, options)));
    }

    const response = await apiFetch(
      `${API_BASE_URL}/api/market-data/quotes?symbols=${encodeURIComponent(unique.join(","))}`
    );
    const payload = await readJson(response);
    return payload.quotes || [];
  }

  async primeQuotes(symbols = [], options = {}) {
    const payloads = await this.fetchQuotes(symbols, options);
    payloads.forEach((payload) => {
      const key = buildQuoteKey(payload.symbol, options.isDemoMode);
      const entry = this.quoteSubscriptions.get(key);
      if (!entry) {
        return;
      }
      entry.lastPayload = payload;
      this.emitCurrentQuote(entry);
    });
    return payloads;
  }

  async getSnapshot(symbol, options = {}) {
    return this.fetchQuote(symbol, options);
  }

  async getHistoricalBars(symbol, timeframe = "1d", options = {}) {
    const timeframeConfig = options.range
      ? { range: options.range, timeframe }
      : mapTimeframeToQuery(timeframe);
    const routeBase = buildRouteBase(options.isDemoMode);
    const response = await apiFetch(
      `${API_BASE_URL}${routeBase}/${encodeURIComponent(symbol)}/price-history?range=${encodeURIComponent(
        timeframeConfig.range
      )}&timeframe=${encodeURIComponent(timeframeConfig.timeframe)}`
    );
    return readJson(response);
  }

  subscribeQuote(symbol, listener, options = {}) {
    const key = buildQuoteKey(symbol, options.isDemoMode);
    const entry = this.quoteSubscriptions.get(key) || {
      symbol,
      options,
      listeners: new Set(),
      lastPayload: null,
    };
    entry.listeners.add(listener);
    this.quoteSubscriptions.set(key, entry);
    if (!options.isDemoMode) {
      this.connect();
      this.sendSocketMessage({ action: "subscribeQuote", symbol: entry.symbol });
    }
    this.emitCurrentQuote(entry, listener);
    if (!options.skipInitialLoad) {
      this.loadQuote(entry);
    }

    return () => this.unsubscribeQuote(symbol, listener, options);
  }

  unsubscribeQuote(symbol, listener, options = {}) {
    const key = buildQuoteKey(symbol, options.isDemoMode);
    const entry = this.quoteSubscriptions.get(key);
    if (!entry) return;
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      this.quoteSubscriptions.delete(key);
      if (!entry.options?.isDemoMode) {
        this.sendSocketMessage({ action: "unsubscribeQuote", symbol: entry.symbol });
      }
    }
  }

  subscribeCandles(symbol, timeframe, listener, options = {}) {
    const key = buildHistoryKey(symbol, timeframe, options.isDemoMode);
    const entry = this.candleSubscriptions.get(key) || {
      symbol,
      timeframe,
      options,
      listeners: new Set(),
      lastPayload: null,
    };
    entry.listeners.add(listener);
    this.candleSubscriptions.set(key, entry);
    if (!options.isDemoMode) {
      this.connect();
      this.sendSocketMessage({
        action: "subscribeHistory",
        range: mapTimeframeToQuery(timeframe).range,
        symbol: entry.symbol,
        timeframe: entry.timeframe,
      });
    }
    this.emitCurrentHistory(entry, listener);
    this.loadHistory(entry);

    return () => this.unsubscribeCandles(symbol, timeframe, listener, options);
  }

  unsubscribeCandles(symbol, timeframe, listener, options = {}) {
    const key = buildHistoryKey(symbol, timeframe, options.isDemoMode);
    const entry = this.candleSubscriptions.get(key);
    if (!entry) return;
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      this.candleSubscriptions.delete(key);
      if (!entry.options?.isDemoMode) {
        this.sendSocketMessage({
          action: "unsubscribeHistory",
          symbol: entry.symbol,
          timeframe: entry.timeframe,
        });
      }
    }
  }

  sendSocketMessage(payload) {
    this.ensureSocket();
    if (!this.socket || this.socket.readyState !== window.WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(payload));
  }

  resubscribeAll() {
    for (const entry of this.quoteSubscriptions.values()) {
      if (!entry.options?.isDemoMode) {
        this.sendSocketMessage({ action: "subscribeQuote", symbol: entry.symbol });
      }
    }

    for (const entry of this.candleSubscriptions.values()) {
      if (!entry.options?.isDemoMode) {
        this.sendSocketMessage({
          action: "subscribeHistory",
          range: mapTimeframeToQuery(entry.timeframe).range,
          symbol: entry.symbol,
          timeframe: entry.timeframe,
        });
      }
    }
  }

  handleSocketMessage(raw) {
    const message = JSON.parse(String(raw || "{}"));

    if (message.channel === "quote" && message.payload?.symbol) {
      const key = buildQuoteKey(message.payload.symbol, false);
      const entry = this.quoteSubscriptions.get(key);
      if (!entry) return;
      entry.lastPayload = message.payload;
      this.emitCurrentQuote(entry);
      return;
    }

    if (message.channel === "history" && message.payload?.symbol) {
      const key = buildHistoryKey(message.payload.symbol, message.timeframe, false);
      const entry = this.candleSubscriptions.get(key);
      if (!entry) return;
      entry.lastPayload = message.payload;
      this.emitCurrentHistory(entry);
      return;
    }

    if (message.channel === "error") {
      for (const entry of this.quoteSubscriptions.values()) {
        entry.listeners.forEach((callback) =>
          callback({ error: message.error || "Market-data stream unavailable.", symbol: entry.symbol })
        );
      }
      for (const entry of this.candleSubscriptions.values()) {
        entry.listeners.forEach((callback) =>
          callback({ error: message.error || "Market-data stream unavailable.", symbol: entry.symbol })
        );
      }
    }
  }

  emitCurrentQuote(entry, listener = null) {
    if (!entry.lastPayload) return;
    if (listener) {
      listener(entry.lastPayload);
      return;
    }
    entry.listeners.forEach((callback) => callback(entry.lastPayload));
  }

  emitCurrentHistory(entry, listener = null) {
    if (!entry.lastPayload) return;
    if (listener) {
      listener(entry.lastPayload);
      return;
    }
    entry.listeners.forEach((callback) => callback(entry.lastPayload));
  }

  async loadQuote(entry) {
    const key = buildQuoteKey(entry.symbol, entry.options?.isDemoMode);
    if (this.quoteInFlight.has(key)) {
      return this.quoteInFlight.get(key);
    }

    const promise = this.fetchQuote(entry.symbol, entry.options)
      .then((payload) => {
        entry.lastPayload = payload;
        this.emitCurrentQuote(entry);
        return payload;
      })
      .catch((error) => {
        entry.listeners.forEach((callback) =>
          callback({ error: error.message || "Unable to load quote.", symbol: entry.symbol })
        );
        return null;
      })
      .finally(() => {
        this.quoteInFlight.delete(key);
      });

    this.quoteInFlight.set(key, promise);
    return promise;
  }

  async loadHistory(entry) {
    const key = buildHistoryKey(entry.symbol, entry.timeframe, entry.options?.isDemoMode);
    if (this.historyInFlight.has(key)) {
      return this.historyInFlight.get(key);
    }

    const promise = this.getHistoricalBars(entry.symbol, entry.timeframe, entry.options)
      .then((payload) => {
        entry.lastPayload = payload;
        this.emitCurrentHistory(entry);
        return payload;
      })
      .catch((error) => {
        entry.listeners.forEach((callback) =>
          callback({ error: error.message || "Unable to load chart data.", symbol: entry.symbol })
        );
        return null;
      })
      .finally(() => {
        this.historyInFlight.delete(key);
      });

    this.historyInFlight.set(key, promise);
    return promise;
  }
}

export function mapTimeframeToQuery(timeframe = "1d") {
  const normalized = String(timeframe || "1d").trim().toLowerCase();
  const mapping = {
    "1m": { range: "1D", timeframe: "1m" },
    "5m": { range: "5D", timeframe: "5m" },
    "15m": { range: "5D", timeframe: "15m" },
    "30m": { range: "1M", timeframe: "30m" },
    "1h": { range: "1M", timeframe: "1h" },
    "4h": { range: "3M", timeframe: "4h" },
    "1d": { range: "1Y", timeframe: "1d" },
    "1w": { range: "1Y", timeframe: "1w" },
    "1mo": { range: "1Y", timeframe: "1mo" },
  };
  return mapping[normalized] || mapping["1d"];
}
