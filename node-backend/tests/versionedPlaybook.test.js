const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  _test,
  buildDeterministicInsights,
  calculateEvidence,
} = require("../services/versionedPlaybookService");

const schema = fs.readFileSync(
  path.join(__dirname, "..", "prisma", "schema.prisma"),
  "utf8"
);
const migration = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "prisma",
    "migrations",
    "20260612000300_rebuild_versioned_playbooks",
    "migration.sql"
  ),
  "utf8"
);
const serviceSource = fs.readFileSync(
  path.join(__dirname, "..", "services", "versionedPlaybookService.js"),
  "utf8"
);

function eligibleRuns() {
  return [
    {
      id: "run-1",
      totalReturn: 4,
      alpha: 1,
      trades: 7,
      marketRegime: "BULL_LOW_VOL",
      strongestSector: "Technology",
      overfittingRisk: "LOW",
      createdAt: "2025-01-01T00:00:00.000Z",
    },
    {
      id: "run-2",
      totalReturn: 2,
      alpha: 0.5,
      trades: 7,
      marketRegime: "BULL_LOW_VOL",
      strongestSector: "Technology",
      overfittingRisk: "LOW",
      createdAt: "2025-02-01T00:00:00.000Z",
    },
    {
      id: "run-3",
      totalReturn: -3,
      alpha: -2,
      trades: 6,
      marketRegime: "BEAR_HIGH_VOL",
      strongestSector: "Financial Services",
      overfittingRisk: "HIGH",
      createdAt: "2025-03-01T00:00:00.000Z",
    },
    {
      id: "run-4",
      totalReturn: 3,
      alpha: 0.7,
      trades: 6,
      marketRegime: "BULL_LOW_VOL",
      strongestSector: "Technology",
      overfittingRisk: "LOW",
      createdAt: "2025-04-01T00:00:00.000Z",
    },
    {
      id: "run-5",
      totalReturn: 1,
      alpha: 0.2,
      trades: 6,
      marketRegime: "NEUTRAL",
      strongestSector: "Industrials",
      overfittingRisk: "MEDIUM",
      createdAt: "2025-05-01T00:00:00.000Z",
    },
  ];
}

function createCloneClient() {
  const updates = [];
  const creates = [];
  const source = {
    id: "version-1",
    userId: "user-a",
    playbookId: "playbook-a",
    versionNumber: 1,
    strategyExperimentId: "strategy-1",
    strategyRunId: "strategy-run-1",
    settingsSnapshot: { emaFast: 20 },
    riskSnapshot: { riskPerTrade: 1 },
    universeSnapshot: { market: "US" },
    executionMode: "MANUAL_APPROVAL",
    horizon: "SWING",
    benchmark: "SPY",
  };
  return {
    updates,
    creates,
    tx: {
      playbook: {
        findFirst: async ({ where }) =>
          where.userId === "user-a" && where.id === "playbook-a"
            ? { id: "playbook-a", userId: "user-a" }
            : null,
        update: async (request) => {
          updates.push(request);
          return request;
        },
      },
      playbookVersion: {
        findFirst: async ({ where, orderBy }) => {
          if (orderBy) return { versionNumber: 1 };
          return where.userId === "user-a" &&
            where.playbookId === "playbook-a" &&
            where.id === "version-1"
            ? source
            : null;
        },
        create: async ({ data }) => {
          const created = { id: "version-2", ...data };
          creates.push(created);
          return created;
        },
      },
    },
  };
}

test("playbooks and versions are owned and indexed by user", () => {
  assert.match(schema, /model PlaybookVersion[\s\S]*userId\s+String/);
  assert.match(schema, /@@index\(\[userId, playbookId\]\)/);
  assert.match(
    serviceSource,
    /where:\s*\{\s*id:\s*versionId,\s*playbookId,\s*userId:\s*ownerId/
  );
});

test("Playbook versions, runs, and insights are append-only at the database layer", () => {
  assert.match(migration, /PlaybookVersion_append_only/);
  assert.match(migration, /PlaybookRun_append_only/);
  assert.match(migration, /PlaybookInsight_append_only/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
});

test("restore creates a new draft version without changing the active version", async () => {
  const client = createCloneClient();
  const result = await _test.cloneVersionWithClient(
    client.tx,
    "user-a",
    "playbook-a",
    "version-1",
    "RESTORE"
  );
  assert.equal(client.creates.length, 1);
  assert.equal(client.creates[0].versionNumber, 2);
  assert.equal(client.creates[0].settingsSnapshot.emaFast, 20);
  assert.equal(client.updates.length, 0);
  assert.equal(result.active, false);
});

test("promotion clones history and changes only the Playbook activeVersionId", async () => {
  const client = createCloneClient();
  const result = await _test.cloneVersionWithClient(
    client.tx,
    "user-a",
    "playbook-a",
    "version-1",
    "PROMOTE"
  );
  assert.equal(client.creates.length, 1);
  assert.deepEqual(client.updates, [
    {
      where: { id: "playbook-a" },
      data: { activeVersionId: "version-2" },
    },
  ]);
  assert.equal(result.active, true);
});

test("deterministic insights require the documented evidence thresholds", () => {
  const insufficient = eligibleRuns().slice(0, 4);
  assert.equal(calculateEvidence(insufficient).eligible, false);
  assert.deepEqual(buildDeterministicInsights(insufficient).insights, []);

  const first = buildDeterministicInsights(eligibleRuns());
  const second = buildDeterministicInsights(eligibleRuns());
  assert.equal(first.evidence.eligible, true);
  assert.deepEqual(first, second);
  assert.ok(first.insights.every((insight) => insight.formula));
  assert.ok(first.insights.every((insight) => insight.sampleSize > 0));
  assert.ok(first.insights.every((insight) => insight.supportingRunIds.length > 0));
});

test("AI output is stored as a reviewable recommendation, never an insight", () => {
  assert.match(serviceSource, /db\.playbookRecommendation\.create/);
  assert.doesNotMatch(
    serviceSource,
    /generateAiPlaybookRecommendation[\s\S]*db\.playbookInsight\.create/
  );
  assert.match(serviceSource, /if \(!dashboard\.evidence\.eligible\)/);
  assert.match(schema, /status\s+PlaybookRecommendationStatus\s+@default\(PENDING_REVIEW\)/);
});

test("deleted strategies cannot break immutable Playbook history", () => {
  assert.match(
    schema,
    /strategyExperiment\s+StrategyExperiment\?\s+@relation\(fields: \[strategyExperimentId\], references: \[id\], onDelete: SetNull\)/
  );
  assert.match(
    schema,
    /strategyRun\s+StrategyRun\?\s+@relation\(fields: \[strategyRunId\], references: \[id\], onDelete: SetNull\)/
  );
  assert.match(schema, /settingsSnapshot\s+Json/);
  assert.match(schema, /riskSnapshot\s+Json/);
  assert.match(schema, /universeSnapshot\s+Json/);
});
