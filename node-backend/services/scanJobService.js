const childProcess = require("node:child_process");
const scanJobRepository = require("../repositories/scanJobRepository");

const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "TIMEOUT",
]);
const DEFAULT_TIMEOUTS = {
  MANUAL: 5 * 60 * 1000,
  SCHEDULED: 10 * 60 * 1000,
};
const PROGRESS_MARKER = "__SCAN_PROGRESS__=";
const ARTIFACTS_MARKER = "__SCAN_ARTIFACTS__=";

function appendOutput(current, chunk, maxLength = 250000) {
  const next = `${current}${chunk.toString()}`;
  return next.length > maxLength ? next.slice(-maxLength) : next;
}

function normalizeProgress(payload = {}) {
  const processed = Math.max(
    0,
    Number.parseInt(payload.processed ?? payload.symbolsProcessed, 10) || 0
  );
  const total = Math.max(
    0,
    Number.parseInt(payload.total ?? payload.symbolsTotal, 10) || 0
  );
  const calculatedProgress = total > 0 ? (processed / total) * 100 : 0;
  const progress = Number.isFinite(Number(payload.progress))
    ? Number(payload.progress)
    : calculatedProgress;

  return {
    progress: Math.max(0, Math.min(100, progress)),
    symbolsProcessed: processed,
    symbolsTotal: total,
    currentStage: String(payload.stage || "SCANNING"),
  };
}

function serializeJob(job) {
  if (!job) return null;

  const startedAt = job.startedAt ? new Date(job.startedAt) : null;
  const elapsedSeconds = startedAt
    ? Math.max(0, (Date.now() - startedAt.getTime()) / 1000)
    : 0;
  const progress = Number(job.progress) || 0;
  const etaSeconds =
    job.status === "RUNNING" && progress > 0 && progress < 100
      ? Math.max(0, elapsedSeconds * (100 / progress - 1))
      : null;

  return {
    id: job.id,
    userId: job.userId,
    status: job.status,
    type: job.type,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    timeoutAt: job.timeoutAt,
    progress,
    currentStage: job.currentStage,
    symbolsProcessed: job.symbolsProcessed,
    symbolsTotal: job.symbolsTotal,
    cancellationRequested: job.cancellationRequested,
    pid: job.pid,
    metadata: job.metadata || {},
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    elapsedSeconds,
    etaSeconds,
  };
}

function createScanJobService({
  prisma,
  spawnImpl = childProcess.spawn,
  repository = scanJobRepository,
  now = () => new Date(),
}) {
  const processes = new Map();

  async function mergeMetadata(userId, jobId, patch) {
    const job = await repository.findOwnedJob(prisma, userId, jobId);
    return repository.updateOwnedJob(prisma, userId, jobId, {
      metadata: {
        ...(job?.metadata || {}),
        ...patch,
      },
    });
  }

  async function finalizeJob(context, status, patch = {}) {
    if (context.settled) return null;
    context.settled = true;
    clearTimeout(context.timeoutHandle);
    processes.delete(context.jobId);

    const job = await repository.findOwnedJob(
      prisma,
      context.userId,
      context.jobId
    );
    const finalProgress = context.latestProgress || {};
    return repository.updateOwnedJob(prisma, context.userId, context.jobId, {
      status,
      finishedAt: now(),
      pid: null,
      progress: status === "COMPLETED" ? 100 : job?.progress || 0,
      symbolsProcessed:
        status === "COMPLETED"
          ? finalProgress.symbolsProcessed ?? job?.symbolsProcessed ?? 0
          : job?.symbolsProcessed ?? 0,
      symbolsTotal:
        status === "COMPLETED"
          ? finalProgress.symbolsTotal ?? job?.symbolsTotal ?? 0
          : job?.symbolsTotal ?? 0,
      currentStage: status,
      metadata: {
        ...(job?.metadata || {}),
        ...patch,
      },
    });
  }

  function terminateProcess(context) {
    if (!context.child || context.child.killed) return;
    context.child.kill("SIGTERM");
    context.forceKillHandle = setTimeout(() => {
      if (!context.child.killed) {
        context.child.kill("SIGKILL");
      }
    }, 2000);
    context.forceKillHandle.unref?.();
  }

  async function persistProgress(context, payload, force = false) {
    const currentTime = Date.now();

    if (!force && currentTime - context.lastProgressWrite < 1000) {
      return;
    }

    context.lastProgressWrite = currentTime;
    await repository.updateOwnedJob(
      prisma,
      context.userId,
      context.jobId,
      payload
    );
  }

  function queueProgress(context, payload, force = false) {
    const normalized = normalizeProgress(payload);
    context.latestProgress = normalized;
    context.progressWriteChain = context.progressWriteChain
      .then(() => persistProgress(context, normalized, force))
      .catch(() => {
        // A transient progress write must not terminate the scanner process.
      });
    return context.progressWriteChain;
  }

  function consumeOutputLines(context, chunk) {
    context.lineBuffer += chunk.toString();
    const lines = context.lineBuffer.split(/\r?\n/);
    context.lineBuffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith(ARTIFACTS_MARKER)) {
        context.artifactLine = line;
      } else if (line.startsWith(PROGRESS_MARKER)) {
        try {
          void queueProgress(
            context,
            JSON.parse(line.slice(PROGRESS_MARKER.length))
          );
        } catch (_error) {
          // Scanner logs remain available in stdout; malformed progress is ignored.
        }
      }
    }
  }

  async function executeJob(job, options) {
    const queuedJob = await repository.findOwnedJob(prisma, job.userId, job.id);
    if (
      !queuedJob ||
      queuedJob.cancellationRequested ||
      TERMINAL_STATUSES.has(queuedJob.status)
    ) {
      return;
    }

    const context = {
      jobId: job.id,
      userId: job.userId,
      child: null,
      settled: false,
      stdout: "",
      stderr: "",
      lineBuffer: "",
      artifactLine: "",
      latestProgress: null,
      lastProgressWrite: 0,
      progressWriteChain: Promise.resolve(),
      timeoutHandle: null,
      forceKillHandle: null,
    };
    processes.set(job.id, context);

    try {
      const child = spawnImpl(options.command, options.args, {
        cwd: options.cwd,
        env: options.env || process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      context.child = child;
      await repository.updateOwnedJob(prisma, job.userId, job.id, {
        status: "RUNNING",
        startedAt: now(),
        pid: child.pid || null,
        currentStage: "STARTING",
      });

      context.timeoutHandle = setTimeout(async () => {
        await finalizeJob(context, "TIMEOUT", {
          error: `Scan exceeded ${Math.round(options.timeoutMs / 1000)} seconds.`,
        });
        terminateProcess(context);
      }, options.timeoutMs);
      context.timeoutHandle.unref?.();

      child.stdout.on("data", (chunk) => {
        context.stdout = appendOutput(context.stdout, chunk);
        consumeOutputLines(context, chunk);
      });
      child.stderr.on("data", (chunk) => {
        context.stderr = appendOutput(context.stderr, chunk);
      });
      child.on("error", async (error) => {
        await finalizeJob(context, "FAILED", { error: error.message });
      });
      child.on("close", async (code, signal) => {
        clearTimeout(context.forceKillHandle);
        if (context.settled) return;

        const currentJob = await repository.findOwnedJob(
          prisma,
          job.userId,
          job.id
        );
        if (currentJob?.cancellationRequested) {
          await finalizeJob(context, "CANCELLED", {
            signal,
            exitCode: code,
          });
          return;
        }
        if (code !== 0) {
          await finalizeJob(context, "FAILED", {
            error:
              context.stderr.trim().split(/\r?\n/).filter(Boolean).pop() ||
              `Scanner exited with code ${code}.`,
            signal,
            exitCode: code,
          });
          return;
        }

        try {
          await context.progressWriteChain;
          if (context.latestProgress) {
            await queueProgress(context, context.latestProgress, true);
          }
          const completionMetadata = await options.onCompleted({
            job,
            stdout: context.stdout,
            stderr: context.stderr,
            artifactLine:
              context.artifactLine ||
              (context.lineBuffer.startsWith(ARTIFACTS_MARKER)
                ? context.lineBuffer
                : ""),
          });
          await finalizeJob(context, "COMPLETED", completionMetadata || {});
        } catch (error) {
          await finalizeJob(context, "FAILED", {
            error: error.message,
          });
        }
      });
    } catch (error) {
      await finalizeJob(context, "FAILED", { error: error.message });
    }
  }

  async function startJob(options) {
    const type = options.type === "SCHEDULED" ? "SCHEDULED" : "MANUAL";
    const timeoutMs = Math.max(
      10,
      Number(options.timeoutMs) || DEFAULT_TIMEOUTS[type]
    );
    const job = await repository.createJob(prisma, {
      userId: options.userId,
      type,
      timeoutAt: new Date(now().getTime() + timeoutMs),
      symbolsTotal: options.symbolsTotal || 0,
      metadata: options.metadata || {},
    });

    setImmediate(() => {
      void executeJob(job, { ...options, type, timeoutMs });
    });
    return serializeJob(job);
  }

  async function getJob(userId, jobId) {
    return serializeJob(await repository.findOwnedJob(prisma, userId, jobId));
  }

  async function getActiveJob(userId, type = null) {
    return serializeJob(await repository.findActiveJob(prisma, userId, type));
  }

  async function cancelJob(userId, jobId) {
    const job = await repository.findOwnedJob(prisma, userId, jobId);
    if (!job) return null;
    if (TERMINAL_STATUSES.has(job.status)) {
      const error = new Error(`Cannot cancel a ${job.status.toLowerCase()} scan.`);
      error.statusCode = 409;
      throw error;
    }

    await repository.updateOwnedJob(prisma, userId, jobId, {
      cancellationRequested: true,
      currentStage: "CANCELLING",
    });
    const context = processes.get(jobId);

    if (context) {
      const cancelledJob = await finalizeJob(context, "CANCELLED", {
        cancelledAt: now().toISOString(),
      });
      terminateProcess(context);
      return serializeJob(cancelledJob);
    }

    return serializeJob(
      await repository.updateOwnedJob(prisma, userId, jobId, {
        status: "CANCELLED",
        finishedAt: now(),
        pid: null,
        currentStage: "CANCELLED",
      })
    );
  }

  async function recoverInterruptedJobs() {
    return repository.markInterruptedJobs(prisma);
  }

  async function shutdown() {
    await Promise.all(
      [...processes.values()].map(async (context) => {
        terminateProcess(context);
        await finalizeJob(context, "CANCELLED", {
          error: "Backend shutdown cancelled the scan.",
        });
      })
    );
  }

  return {
    cancelJob,
    getActiveJob,
    getJob,
    recoverInterruptedJobs,
    serializeJob,
    shutdown,
    startJob,
  };
}

module.exports = {
  ARTIFACTS_MARKER,
  DEFAULT_TIMEOUTS,
  PROGRESS_MARKER,
  createScanJobService,
  normalizeProgress,
  serializeJob,
};
