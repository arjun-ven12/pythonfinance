const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  blockDemoMutation,
  requireDemoAccess,
} = require("../middleware/accessControl");
const { getDemoPayload } = require("../features/demo/demoData");

function createResponse() {
  return {
    body: null,
    statusCode: 200,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test("requireDemoAccess marks the request as demo mode", () => {
  const req = {};
  let nextCalled = false;

  requireDemoAccess(req, createResponse(), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.demoAccess, { isDemoMode: true });
});

test("blockDemoMutation allows reads and blocks writes", () => {
  const readReq = { method: "GET", path: "/dashboard" };
  let readNext = false;
  blockDemoMutation(readReq, createResponse(), () => {
    readNext = true;
  });
  assert.equal(readNext, true);

  const writeReq = { method: "POST", path: "/approvals" };
  const writeRes = createResponse();
  let writeNext = false;
  blockDemoMutation(writeReq, writeRes, () => {
    writeNext = true;
  });
  assert.equal(writeNext, false);
  assert.equal(writeRes.statusCode, 405);
  assert.equal(writeRes.body.isDemoMode, true);
});

test("demo payloads are clearly labeled and contain sample data only", () => {
  const payload = getDemoPayload("dashboard");
  assert.equal(payload.isDemoMode, true);
  assert.equal(payload.label, "DEMO DATA");
  assert.ok(payload.payload.riskSummary.accountEquity > 0);
  assert.equal(getDemoPayload("validation").payload.confidenceBuckets.length > 0, true);
  assert.equal(getDemoPayload("playbook").payload.evidenceUpdated, true);
});

test("public demo routes are mounted before the global auth boundary", () => {
  const serverPath = path.join(__dirname, "..", "server.js");
  const source = fs.readFileSync(serverPath, "utf8");
  const demoRouteIndex = source.indexOf('app.use("/api/demo", requireDemoAccess, blockDemoMutation, createDemoRouter())');
  const authBoundaryIndex = source.indexOf('app.use("/api", authMiddleware)');

  assert.ok(demoRouteIndex > 0);
  assert.ok(demoRouteIndex < authBoundaryIndex);
});
