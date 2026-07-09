const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ownedWhere,
  requireUserId,
} = require("../repositories/ownership");

test("owned queries always constrain records to the authenticated user", () => {
  assert.deepEqual(ownedWhere("user-a", { id: "record-1" }), {
    id: "record-1",
    userId: "user-a",
  });
  assert.notDeepEqual(
    ownedWhere("user-a", { id: "record-1" }),
    ownedWhere("user-b", { id: "record-1" })
  );
});

test("owned repositories fail closed when user identity is missing", () => {
  assert.throws(() => requireUserId(null), /ownership is required/);
  assert.throws(() => ownedWhere("", { id: "record-1" }), /ownership is required/);
});
