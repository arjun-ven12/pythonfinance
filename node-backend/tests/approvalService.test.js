const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assertAllowedTransition,
  requireApprovedApprovalForExecution,
  transitionApprovalRequest,
} = require("../services/approvalService");
const prisma = require("../services/prisma");

test("approval state machine allows only documented transitions", () => {
  for (const [from, to] of [
    ["PENDING", "APPROVED"],
    ["PENDING", "REJECTED"],
    ["PENDING", "SNOOZED"],
    ["SNOOZED", "PENDING"],
    ["APPROVED", "EXECUTED"],
  ]) {
    assert.doesNotThrow(() => assertAllowedTransition(from, to));
  }
});

test("approval state machine blocks terminal and duplicate transitions", () => {
  for (const [from, to] of [
    ["REJECTED", "APPROVED"],
    ["EXECUTED", "APPROVED"],
    ["EXECUTED", "REJECTED"],
    ["EXECUTED", "EXECUTED"],
    ["APPROVED", "APPROVED"],
  ]) {
    assert.throws(
      () => assertAllowedTransition(from, to),
      /is not allowed/
    );
  }
});

test("user A cannot transition user B approval request", async () => {
  const originalRun = prisma.run;
  let updateCalled = false;
  prisma.run = async (operation) => operation({
    $transaction: async (callback) => callback({
      approvalRequest: {
        findFirst: async ({ where }) => (
          where.id === "approval-b" && where.userId === "user-b"
            ? { id: "approval-b", userId: "user-b", status: "PENDING" }
            : null
        ),
        updateMany: async () => {
          updateCalled = true;
          return { count: 1 };
        },
      },
    }),
  });

  try {
    await assert.rejects(
      transitionApprovalRequest({
        id: "approval-b",
        userId: "user-a",
        toStatus: "APPROVED",
      }),
      /not found/
    );
    assert.equal(updateCalled, false);
  } finally {
    prisma.run = originalRun;
  }
});

test("user A cannot execute user B approved request", async () => {
  const client = {
    approvalRequest: {
      findFirst: async ({ where }) =>
        where.id === "approval-b" &&
        where.userId === "user-b" &&
        where.status === "APPROVED"
          ? { id: "approval-b", userId: "user-b", status: "APPROVED" }
          : null,
    },
  };

  await assert.rejects(
    requireApprovedApprovalForExecution(client, "approval-b", "user-a"),
    /not found for this user/
  );
});
