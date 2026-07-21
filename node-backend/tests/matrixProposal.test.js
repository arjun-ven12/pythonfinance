const assert = require("node:assert/strict");
const test = require("node:test");
const { createMatrixProposalService } = require("../features/strategyLab/services/matrixProposal.service");

function proposalRecord(overrides = {}) {
  return {
    id: "proposal-1",
    userId: "user-1",
    deploymentSetId: "deployment-1",
    title: "Lower drawdown",
    objective: "Reduce drawdown",
    status: "DRAFT",
    deletedAt: null,
    deploymentUpdatedAt: new Date("2026-07-11T00:00:00Z"),
    proposalJson: {},
    decisions: [],
    ...overrides,
  };
}

test("stale matrix proposals are rejected before replay or deployment mutation", async () => {
  let contextCalls = 0;
  let deploymentCalls = 0;
  const record = proposalRecord();
  const prisma = { run: async (callback) => callback({
    matrixProposal: { findFirst: async () => record },
    strategyDeploymentSet: { findFirst: async () => ({ id: "deployment-1", userId: "user-1", updatedAt: new Date("2026-07-11T01:00:00Z") }) },
  }) };
  const service = createMatrixProposalService({
    prisma,
    matrixAdvisorService: {},
    scenarioService: {},
    matrixCopilotService: { buildContext: async () => { contextCalls += 1; } },
    updateDeploymentAllocation: async () => { deploymentCalls += 1; },
  });
  await assert.rejects(() => service.approve("user-1", record.id), /live deployment matrix changed/i);
  assert.equal(contextCalls, 0);
  assert.equal(deploymentCalls, 0);
});

test("rejecting a draft records a decision without invoking deployment", async () => {
  const record = proposalRecord();
  let deploymentCalls = 0;
  const decisions = [];
  const prisma = { run: async (callback) => callback({
    matrixProposal: {
      findFirst: async () => record,
      update: async ({ data }) => ({ ...record, ...data }),
    },
    $transaction: async (transaction) => transaction({
      matrixProposalDecision: { create: async ({ data }) => decisions.push(data) },
      matrixProposal: { update: async ({ data }) => ({ ...record, ...data }) },
    }),
  }) };
  const service = createMatrixProposalService({
    prisma,
    matrixAdvisorService: {},
    scenarioService: {},
    matrixCopilotService: {},
    updateDeploymentAllocation: async () => { deploymentCalls += 1; },
  });
  const rejected = await service.reject("user-1", record.id, "Not suitable");
  assert.equal(rejected.status, "REJECTED");
  assert.equal(decisions[0].status, "REJECTED");
  assert.equal(deploymentCalls, 0);
});
