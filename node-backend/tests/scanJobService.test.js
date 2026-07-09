const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { createScanJobService } = require("../services/scanJobService");

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeoutMilliseconds = 250) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await wait(5);
  }
  throw new Error("Timed out waiting for test condition.");
}

function createFakeRepository() {
  const jobs = new Map();
  let sequence = 0;

  return {
    jobs,
    async createJob(_prisma, data) {
      const active = [...jobs.values()].find(
        (job) =>
          job.userId === data.userId &&
          job.type === data.type &&
          ["QUEUED", "RUNNING"].includes(job.status)
      );
      if (active) {
        const error = new Error("active scan exists");
        error.statusCode = 409;
        error.job = active;
        throw error;
      }
      const now = new Date();
      const job = {
        id: `job-${++sequence}`,
        status: "QUEUED",
        progress: 0,
        symbolsProcessed: 0,
        cancellationRequested: false,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      jobs.set(job.id, job);
      return { ...job };
    },
    async findOwnedJob(_prisma, userId, jobId) {
      const job = jobs.get(jobId);
      return job?.userId === userId ? { ...job } : null;
    },
    async findActiveJob(_prisma, userId, type = null) {
      const job = [...jobs.values()].find(
        (candidate) =>
          candidate.userId === userId &&
          (!type || candidate.type === type) &&
          ["QUEUED", "RUNNING"].includes(candidate.status)
      );
      return job ? { ...job } : null;
    },
    async updateOwnedJob(_prisma, userId, jobId, data) {
      const job = jobs.get(jobId);
      if (!job || job.userId !== userId) return null;
      const updated = { ...job, ...data, updatedAt: new Date() };
      jobs.set(jobId, updated);
      return { ...updated };
    },
    async markInterruptedJobs() {
      return { count: 0 };
    },
  };
}

function createFakeSpawn() {
  const children = [];
  const spawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.pid = 1000 + children.length;
    child.killed = false;
    child.kill = (signal) => {
      child.killed = true;
      setImmediate(() => child.emit("close", null, signal));
      return true;
    };
    children.push(child);
    return child;
  };
  return { children, spawn };
}

function createHarness() {
  const repository = createFakeRepository();
  const fakeSpawn = createFakeSpawn();
  const service = createScanJobService({
    prisma: {},
    repository,
    spawnImpl: fakeSpawn.spawn,
  });
  const start = (userId, options = {}) =>
    service.startJob({
      userId,
      type: options.type || "MANUAL",
      command: "python",
      args: ["scanner.py"],
      cwd: "/tmp",
      timeoutMs: options.timeoutMs || 1000,
      symbolsTotal: options.symbolsTotal || 2,
      onCompleted:
        options.onCompleted ||
        (async () => ({ opportunityCount: 1 })),
    });
  return { fakeSpawn, repository, service, start };
}

test("user A scan does not block user B", async () => {
  const { start } = createHarness();
  const [userA, userB] = await Promise.all([start("user-a"), start("user-b")]);

  assert.notEqual(userA.id, userB.id);
  assert.equal(userA.userId, "user-a");
  assert.equal(userB.userId, "user-b");
});

test("one user cannot start two active manual scans", async () => {
  const { start } = createHarness();
  await start("user-a");

  await assert.rejects(start("user-a"), (error) => error.statusCode === 409);
});

test("scanner progress events persist processed counts", async () => {
  const { fakeSpawn, service, start } = createHarness();
  const job = await start("user-a", { symbolsTotal: 5 });
  const child = await waitFor(() => fakeSpawn.children[0]);
  child.stdout.emit(
    "data",
    Buffer.from(
      '__SCAN_PROGRESS__={"progress":40,"processed":2,"total":5,"stage":"SCANNING"}\n'
    )
  );
  await wait(10);

  const persisted = await service.getJob("user-a", job.id);
  assert.equal(persisted.progress, 40);
  assert.equal(persisted.symbolsProcessed, 2);
  assert.equal(persisted.symbolsTotal, 5);
  assert.equal(persisted.currentStage, "SCANNING");
});

test("large scanner artifacts survive bounded stdout log retention", async () => {
  const { fakeSpawn, service, start } = createHarness();
  let capturedArtifactLine = "";
  const job = await start("user-a", {
    onCompleted: async ({ artifactLine }) => {
      capturedArtifactLine = artifactLine;
      return { opportunityCount: 1 };
    },
  });
  const child = await waitFor(() => fakeSpawn.children[0]);
  const artifactPayload = JSON.stringify({
    scan_results: {
      opportunities: [
        {
          symbol: "AAPL",
          reasons: ["x".repeat(350000)],
        },
      ],
    },
  });
  const artifactOutput = `__SCAN_ARTIFACTS__=${artifactPayload}\n`;

  for (let index = 0; index < artifactOutput.length; index += 16384) {
    child.stdout.emit(
      "data",
      Buffer.from(artifactOutput.slice(index, index + 16384))
    );
  }
  child.emit("close", 0, null);
  await wait(20);
  const completed = await service.getJob("user-a", job.id);

  assert.equal(completed.status, "COMPLETED");
  assert.equal(capturedArtifactLine.startsWith("__SCAN_ARTIFACTS__="), true);
  assert.equal(capturedArtifactLine.length > 250000, true);
});

test("final progress cannot be overwritten by an earlier async update", async () => {
  const { fakeSpawn, service, start } = createHarness();
  const job = await start("user-a", { symbolsTotal: 1 });
  const child = await waitFor(() => fakeSpawn.children[0]);
  await wait(10);

  child.stdout.emit(
    "data",
    Buffer.from(
      '__SCAN_PROGRESS__={"progress":0,"processed":0,"total":1,"stage":"LOADING"}\n' +
        '__SCAN_PROGRESS__={"progress":100,"processed":1,"total":1,"stage":"PERSISTING_RESULTS"}\n'
    )
  );
  await wait(10);
  child.emit("close", 0, null);
  await wait(20);

  const completed = await service.getJob("user-a", job.id);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.progress, 100);
  assert.equal(completed.symbolsProcessed, 1);
  assert.equal(completed.symbolsTotal, 1);
});

test("cancelling a scan terminates only that job", async () => {
  const { fakeSpawn, service, start } = createHarness();
  const userA = await start("user-a");
  const userB = await start("user-b");
  await wait(5);

  const cancelled = await service.cancelJob("user-a", userA.id);
  const other = await service.getJob("user-b", userB.id);

  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(fakeSpawn.children[0].killed, true);
  assert.equal(fakeSpawn.children[1].killed, false);
  assert.equal(other.status, "RUNNING");
});

test("timeout marks the job terminal and unlocks the user", async () => {
  const { service, start } = createHarness();
  const first = await start("user-a", { timeoutMs: 20 });
  await wait(40);

  const timedOut = await service.getJob("user-a", first.id);
  assert.equal(timedOut.status, "TIMEOUT");

  const second = await start("user-a");
  assert.notEqual(second.id, first.id);
});

test("scheduled scan isolation is enforced per user", async () => {
  const { start } = createHarness();
  const userA = await start("user-a", { type: "SCHEDULED" });
  const userB = await start("user-b", { type: "SCHEDULED" });

  assert.equal(userA.type, "SCHEDULED");
  assert.equal(userB.type, "SCHEDULED");
  await assert.rejects(
    start("user-a", { type: "SCHEDULED" }),
    (error) => error.statusCode === 409
  );
});

test("server orchestration has no singleton scan or scheduler ownership state", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8"
  );
  const engineSource = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "features",
      "engine",
      "services",
      "engineRuntime.service.js"
    ),
    "utf8"
  );

  assert.doesNotMatch(source, /let scanInProgress/);
  assert.doesNotMatch(source, /schedulerOwnerUserId/);
  assert.match(source, /const schedulerControllers = new Map\(\)/);
  assert.match(engineSource, /startScanJobForUser\([\s\S]*"SCHEDULED"/);
});
