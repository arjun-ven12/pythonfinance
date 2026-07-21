const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("memory retrieval API is protected by the global auth boundary and diagnostics require owner admin", () => {
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../features/memory/routes/memory.routes.js"), "utf8");
  assert.ok(server.indexOf('app.use("/api", authMiddleware)') < server.indexOf("createMemoryRouter({"));
  assert.match(routes, /router\.post\("\/memory\/retrieve", controller\.retrieve\)/);
  assert.match(routes, /router\.get\("\/memory\/retrieval\/diagnostics", deps\.requireAdmin/);
  assert.doesNotMatch(server, /CopilotService\([^)]*memoryRetrievalService/);
});
