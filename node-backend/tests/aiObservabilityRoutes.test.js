const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const createAiRouter = require("../features/ai/routes/ai.routes");

test("AI observability dashboard and detail endpoints are admin-readable", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: "owner" }; next(); });
  const observabilityService = {
    async dashboard() { return { summary: { allTime: { requests: 2 } }, recent: [] }; },
    async requestDetail(id) { return id === "known" ? { id, feature: "chat" } : null; },
    async listRequests() { return { requests: [], total: 0 }; },
    async usageByPeriod() { return []; },
    async featureUsage() { return []; },
    async userUsage() { return []; },
    async costSummary() { return { allTime: {} }; },
    async largestRequests() { return {}; },
    async optimizationReport() { return { items: [] }; },
  };
  app.use("/api", createAiRouter({
    aiService: { getDiagnostics: async () => ({}) },
    observabilityService,
    aiRateLimiter: (_req, _res, next) => next(),
    requireAdmin: (_req, _res, next) => next(),
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  try {
    const dashboard = await fetch(`${origin}/api/ai/observability/dashboard`);
    assert.equal(dashboard.status, 200);
    assert.equal((await dashboard.json()).summary.allTime.requests, 2);

    const detail = await fetch(`${origin}/api/ai/observability/requests/known`);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).feature, "chat");

    const missing = await fetch(`${origin}/api/ai/observability/requests/missing`);
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
