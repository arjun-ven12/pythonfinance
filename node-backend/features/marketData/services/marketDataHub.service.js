const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { WebSocket, WebSocketServer } = require("ws");
const prisma = require("../../../services/prisma");
const { buildPageAccessMap, VERIFICATION_STATUSES } = require("../../../middleware/accessControl");
const { getJwtSecret } = require("../../../middleware/authMiddleware");

function parseCookies(header = "") {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const divider = part.indexOf("=");
      if (divider === -1) {
        return accumulator;
      }
      const key = part.slice(0, divider).trim();
      const value = part.slice(divider + 1).trim();
      if (key) {
        accumulator[key] = decodeURIComponent(value);
      }
      return accumulator;
    }, {});
}

function toSafeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    verificationStatus: user.verificationStatus,
    pageAccess: buildPageAccessMap(user),
  };
}

async function authenticateSocket(request) {
  const cookies = parseCookies(request.headers?.cookie);
  const token = cookies.trading_access;
  if (!token) {
    throw new Error("Authentication required.");
  }

  const payload = jwt.verify(token, getJwtSecret());
  if (payload.tokenType && payload.tokenType !== "access") {
    throw new Error("Invalid or expired token.");
  }

  const user = await prisma.run((db) =>
    db.user.findUnique({
      where: { id: payload.userId },
      include: { pageAccessEntries: true },
    })
  );

  if (!user || user.verificationStatus !== VERIFICATION_STATUSES.VERIFIED) {
    throw new Error("Verified access is required.");
  }

  return toSafeUser(user);
}

function safeSend(socket, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function quoteSignature(payload = {}) {
  return JSON.stringify({
    last: payload?.quote?.last ?? null,
    bid: payload?.quote?.bid ?? null,
    ask: payload?.quote?.ask ?? null,
    updated: payload?.lastUpdated ?? null,
    provider: payload?.provider ?? null,
  });
}

function historySignature(payload = {}) {
  const points = Array.isArray(payload?.points) ? payload.points : [];
  const lastPoint = points[points.length - 1] || null;
  return JSON.stringify({
    length: points.length,
    updated: payload?.lastUpdated ?? null,
    close: lastPoint?.close ?? null,
    timestamp: lastPoint?.timestamp ?? null,
    provider: payload?.provider ?? null,
  });
}

function createMarketDataHubService({
  historyPollMs = 20_000,
  marketDataService,
  metrics,
  quotePollMs = 3_000,
}) {
  const clients = new Map();
  const quoteSubscriptions = new Map();
  const historySubscriptions = new Map();
  let quoteTimer = null;
  let historyTimer = null;
  let wss = null;

  function setSubscriberGauges() {
    const websocketSubscribers = [...clients.keys()].filter(
      (socket) => socket.readyState === socket.OPEN
    ).length;
    metrics?.setGauge("websocketSubscribers", websocketSubscribers);
    metrics?.setGauge("quoteSubscriptions", quoteSubscriptions.size);
    metrics?.setGauge("historySubscriptions", historySubscriptions.size);
  }

  function buildQuoteKey(userId, symbol) {
    return `${userId}:${String(symbol || "").toUpperCase()}`;
  }

  function buildHistoryKey(userId, symbol, timeframe) {
    return `${userId}:${String(symbol || "").toUpperCase()}:${String(timeframe || "1d").toLowerCase()}`;
  }

  function ensureQuoteLoop() {
    if (quoteTimer || quoteSubscriptions.size === 0) {
      return;
    }

    quoteTimer = setInterval(() => {
      flushQuotes().catch((error) => {
        console.warn(`Market-data quote broadcast failed: ${error.message}`);
      });
    }, quotePollMs);

    if (typeof quoteTimer.unref === "function") {
      quoteTimer.unref();
    }
  }

  function ensureHistoryLoop() {
    if (historyTimer || historySubscriptions.size === 0) {
      return;
    }

    historyTimer = setInterval(() => {
      flushHistory().catch((error) => {
        console.warn(`Market-data history broadcast failed: ${error.message}`);
      });
    }, historyPollMs);

    if (typeof historyTimer.unref === "function") {
      historyTimer.unref();
    }
  }

  function stopLoopsIfIdle() {
    if (quoteSubscriptions.size === 0 && quoteTimer) {
      clearInterval(quoteTimer);
      quoteTimer = null;
    }

    if (historySubscriptions.size === 0 && historyTimer) {
      clearInterval(historyTimer);
      historyTimer = null;
    }
  }

  async function flushQuotes() {
    const grouped = new Map();

    for (const entry of quoteSubscriptions.values()) {
      const list = grouped.get(entry.userId) || [];
      list.push(entry.symbol);
      grouped.set(entry.userId, list);
    }

    for (const [userId, symbols] of grouped.entries()) {
      const quotes = await marketDataService.getQuotes(userId, symbols);
      for (const payload of quotes) {
        const key = buildQuoteKey(userId, payload.symbol);
        const entry = quoteSubscriptions.get(key);
        if (!entry) {
          continue;
        }

        const nextSignature = quoteSignature(payload);
        if (entry.lastSignature === nextSignature) {
          continue;
        }

        entry.lastSignature = nextSignature;
        for (const socket of entry.listeners) {
          safeSend(socket, {
            channel: "quote",
            symbol: payload.symbol,
            payload,
            requestId: crypto.randomUUID(),
          });
        }
      }
    }
  }

  async function flushHistory() {
    for (const entry of historySubscriptions.values()) {
      const payload = await marketDataService.getPriceHistory(
        entry.userId,
        entry.symbol,
        entry.range,
        entry.timeframe
      );
      const nextSignature = historySignature(payload);
      if (entry.lastSignature === nextSignature) {
        continue;
      }

      entry.lastSignature = nextSignature;
      for (const socket of entry.listeners) {
        safeSend(socket, {
          channel: "history",
          symbol: payload.symbol,
          timeframe: entry.timeframe,
          payload,
          requestId: crypto.randomUUID(),
        });
      }
    }
  }

  function subscribeQuote(socket, user, symbol) {
    const key = buildQuoteKey(user.id, symbol);
    const entry = quoteSubscriptions.get(key) || {
      key,
      lastSignature: null,
      listeners: new Set(),
      symbol: String(symbol || "").toUpperCase(),
      userId: user.id,
    };
    entry.listeners.add(socket);
    quoteSubscriptions.set(key, entry);

    const client = clients.get(socket);
    client.quoteKeys.add(key);
    setSubscriberGauges();
    ensureQuoteLoop();
    flushQuotes().catch(() => {});
  }

  function unsubscribeQuote(socket, user, symbol) {
    const key = buildQuoteKey(user.id, symbol);
    const entry = quoteSubscriptions.get(key);
    if (!entry) {
      return;
    }

    entry.listeners.delete(socket);
    if (entry.listeners.size === 0) {
      quoteSubscriptions.delete(key);
    }

    const client = clients.get(socket);
    client?.quoteKeys.delete(key);
    setSubscriberGauges();
    stopLoopsIfIdle();
  }

  function subscribeHistory(socket, user, symbol, timeframe = "1d", range = null) {
    const normalizedTimeframe = String(timeframe || "1d").toLowerCase();
    const key = buildHistoryKey(user.id, symbol, normalizedTimeframe);
    const entry = historySubscriptions.get(key) || {
      key,
      lastSignature: null,
      listeners: new Set(),
      range: range || null,
      symbol: String(symbol || "").toUpperCase(),
      timeframe: normalizedTimeframe,
      userId: user.id,
    };
    entry.listeners.add(socket);
    historySubscriptions.set(key, entry);

    const client = clients.get(socket);
    client.historyKeys.add(key);
    setSubscriberGauges();
    ensureHistoryLoop();
    flushHistory().catch(() => {});
  }

  function unsubscribeHistory(socket, user, symbol, timeframe = "1d") {
    const key = buildHistoryKey(user.id, symbol, timeframe);
    const entry = historySubscriptions.get(key);
    if (!entry) {
      return;
    }

    entry.listeners.delete(socket);
    if (entry.listeners.size === 0) {
      historySubscriptions.delete(key);
    }

    const client = clients.get(socket);
    client?.historyKeys.delete(key);
    setSubscriberGauges();
    stopLoopsIfIdle();
  }

  function cleanupSocket(socket) {
    const client = clients.get(socket);
    if (!client) {
      return;
    }

    for (const key of client.quoteKeys) {
      const entry = quoteSubscriptions.get(key);
      entry?.listeners.delete(socket);
      if (entry && entry.listeners.size === 0) {
        quoteSubscriptions.delete(key);
      }
    }

    for (const key of client.historyKeys) {
      const entry = historySubscriptions.get(key);
      entry?.listeners.delete(socket);
      if (entry && entry.listeners.size === 0) {
        historySubscriptions.delete(key);
      }
    }

    clients.delete(socket);
    setSubscriberGauges();
    stopLoopsIfIdle();
  }

  function attach(httpServer) {
    wss = new WebSocketServer({ path: "/ws/market-data", server: httpServer });

    wss.on("connection", async (socket, request) => {
      try {
        const user = await authenticateSocket(request);
        clients.set(socket, {
          historyKeys: new Set(),
          quoteKeys: new Set(),
          user,
        });
        setSubscriberGauges();
        safeSend(socket, {
          channel: "connection",
          status: "connected",
          userId: user.id,
        });

        socket.on("message", (message) => {
          try {
            const payload = JSON.parse(String(message || "{}"));
            const client = clients.get(socket);
            if (!client) {
              return;
            }

            const symbol = String(payload.symbol || "").trim().toUpperCase();
            if (!symbol) {
              return;
            }

            if (payload.action === "subscribeQuote") {
              subscribeQuote(socket, client.user, symbol);
              return;
            }

            if (payload.action === "unsubscribeQuote") {
              unsubscribeQuote(socket, client.user, symbol);
              return;
            }

            if (payload.action === "subscribeHistory") {
              subscribeHistory(
                socket,
                client.user,
                symbol,
                payload.timeframe || "1d",
                payload.range || null
              );
              return;
            }

            if (payload.action === "unsubscribeHistory") {
              unsubscribeHistory(socket, client.user, symbol, payload.timeframe || "1d");
            }
          } catch (error) {
            safeSend(socket, {
              channel: "error",
              error: error.message || "Invalid market-data message.",
            });
          }
        });

        socket.on("close", () => cleanupSocket(socket));
        socket.on("error", () => cleanupSocket(socket));
      } catch (error) {
        safeSend(socket, {
          channel: "error",
          error: error.message || "Unable to authorize market-data connection.",
        });
        socket.close(4401, "Unauthorized");
      }
    });
  }

  async function stop() {
    if (quoteTimer) {
      clearInterval(quoteTimer);
      quoteTimer = null;
    }
    if (historyTimer) {
      clearInterval(historyTimer);
      historyTimer = null;
    }
    if (wss) {
      for (const socket of wss.clients) {
        socket.close(1001, "Server shutting down");
      }
      await new Promise((resolve) => wss.close(resolve));
      wss = null;
    }
  }

  return {
    attach,
    stop,
  };
}

module.exports = createMarketDataHubService;
