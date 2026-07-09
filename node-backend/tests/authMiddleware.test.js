const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  authMiddleware,
  toSafeUser,
} = require("../middleware/authMiddleware");

function createResponse() {
  return {
    body: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("protected requests without an access cookie return 401", async () => {
  const req = { headers: {}, cookies: {} };
  const res = createResponse();
  let nextCalled = false;

  await authMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Authentication required.");
  assert.equal(nextCalled, false);
});

test("protected requests with an invalid access cookie return 401", async () => {
  const req = {
    headers: {},
    cookies: { trading_access: "not-a-jwt" },
  };
  const res = createResponse();
  let nextCalled = false;

  await authMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "Invalid or expired token.");
  assert.equal(nextCalled, false);
});

test("safe users never expose password hashes", () => {
  const safeUser = toSafeUser({
    id: "user-1",
    name: "Trader",
    email: "trader@example.com",
    passwordHash: "secret-hash",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  });

  assert.equal(safeUser.id, "user-1");
  assert.equal(safeUser.email, "trader@example.com");
  assert.equal("passwordHash" in safeUser, false);
});

test("the global API auth boundary is mounted before protected routes", () => {
  const serverPath = path.join(__dirname, "..", "server.js");
  const source = fs.readFileSync(serverPath, "utf8");
  const authBoundaryIndex = source.indexOf('app.use("/api", authMiddleware)');
  const verificationBoundaryIndex = source.indexOf('app.use("/api", requireVerifiedUser)');
  const firstProtectedRouteIndex = source.indexOf('app.use("/api", createSystemRouter');

  assert.ok(authBoundaryIndex > 0);
  assert.ok(verificationBoundaryIndex > authBoundaryIndex);
  assert.ok(firstProtectedRouteIndex > authBoundaryIndex);
});
