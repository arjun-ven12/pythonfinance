const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const createAiRouter = require("../features/ai/routes/ai.routes");
const {
  createAiRateLimiter,
  createInternalAiRateLimiter,
} = require("../middleware/aiRateLimit");

async function withAiServer(callback, aiService) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "user-1" };
    next();
  });
  app.use(
    "/api",
    createAiRouter({
      aiService,
      aiRateLimiter: createAiRateLimiter(),
    })
  );
  app.get("/api/strategy-health", (_req, res) => {
    res.json({ ok: true });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("AI routes return structured JSON", async () => {
  await withAiServer(async (origin) => {
    const response = await fetch(`${origin}/api/ai/analyze-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: "AMD" }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.rating, 80);
    assert.equal(payload.meta.provider, "OPENAI");
  }, {
    analyzeStock: async () => ({
      rating: 80,
      confidence: 82,
      trend: "Bullish",
      summary: "Constructive setup.",
      strengths: ["Trend"],
      risks: ["Volatility"],
      recommendation: "Wait for confirmation.",
      meta: { cached: false, provider: "OPENAI", model: "gpt-5.4" },
    }),
    analyzePortfolio: async () => ({}),
    explainScannerResult: async () => ({}),
    reviewTrade: async () => ({}),
    summarizeNews: async () => ({}),
    chat: async () => ({}),
  });
});

test("AI routes enforce a 30 request per minute rate limit per user", async () => {
  await withAiServer(async (origin) => {
    const responses = [];
    for (let index = 0; index < 31; index += 1) {
      responses.push(
        await fetch(`${origin}/api/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [{ role: "user", content: `hello ${index}` }] }),
        })
      );
    }

    assert.equal(responses[29].status, 200);
    assert.equal(responses[30].status, 429);
    const payload = await responses[30].json();
    assert.match(payload.error, /AI request limit reached/i);
  }, {
    analyzeStock: async () => ({}),
    analyzePortfolio: async () => ({}),
    explainScannerResult: async () => ({}),
    reviewTrade: async () => ({}),
    summarizeNews: async () => ({}),
    chat: async () => ({
      answer: "ok",
      confidence: 70,
      bullets: [],
      followUps: [],
      meta: { cached: false, provider: "OPENAI", model: "gpt-5.4" },
    }),
  });
});

test("internal AI limiter uses an independent scanner burst allowance", async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: "user-1" };
    next();
  });
  app.get("/interactive", createAiRateLimiter({ limit: 1 }), (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/internal", createInternalAiRateLimiter({ limit: 2 }), (_req, res) => {
    res.json({ ok: true });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    assert.equal((await fetch(`${origin}/interactive`)).status, 200);
    assert.equal((await fetch(`${origin}/interactive`)).status, 429);
    assert.equal((await fetch(`${origin}/internal`)).status, 200);
    assert.equal((await fetch(`${origin}/internal`)).status, 200);
    assert.equal((await fetch(`${origin}/internal`)).status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("non-AI API requests do not consume the AI rate limit", async () => {
  await withAiServer(async (origin) => {
    for (let index = 0; index < 35; index += 1) {
      const response = await fetch(`${origin}/api/strategy-health`);
      assert.equal(response.status, 200);
    }

    const aiResponse = await fetch(`${origin}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });

    assert.equal(aiResponse.status, 200);
  }, {
    analyzeStock: async () => ({}),
    analyzePortfolio: async () => ({}),
    explainScannerResult: async () => ({}),
    reviewTrade: async () => ({}),
    summarizeNews: async () => ({}),
    chat: async () => ({
      answer: "ok",
      confidence: 70,
      bullets: [],
      followUps: [],
      meta: { cached: false, provider: "OPENAI", model: "gpt-5.4" },
    }),
  });
});
