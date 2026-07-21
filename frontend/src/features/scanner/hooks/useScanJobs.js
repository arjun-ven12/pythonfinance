import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";

const EMPTY_PROGRESS = {
  visible: false,
  status: "idle",
  percent: 0,
  elapsedSeconds: 0,
  remainingSeconds: 0,
  label: "",
  processed: 0,
  total: 0,
  stage: "",
  summary: null,
};

function buildInitialProgress(total) {
  return {
    visible: true,
    status: "running",
    percent: 0,
    elapsedSeconds: 0,
    remainingSeconds: 0,
    processed: 0,
    total: Number(total) || 0,
    stage: "QUEUED",
    label: "Running fresh scan...",
    summary: null,
  };
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function buildCompletedLabel(job) {
  const scanSummary = job?.metadata?.scanSummary || {};
  const opportunityCount = numberOrZero(
    job?.metadata?.opportunityCount ?? scanSummary.opportunities_returned
  );
  const skippedCount = numberOrZero(scanSummary.skipped_count);
  const errorCount = numberOrZero(scanSummary.error_count);
  const processed = numberOrZero(
    job?.symbolsProcessed ?? scanSummary.symbols_processed
  );
  const total = numberOrZero(job?.symbolsTotal ?? scanSummary.symbols_considered);
  const symbolText =
    processed || total
      ? `${processed || total} / ${total || processed} symbols processed`
      : "Scan completed";
  const skippedText = skippedCount ? ` · ${skippedCount} skipped` : "";
  const errorText = errorCount ? ` · ${errorCount} errors` : "";

  return `${symbolText} · ${opportunityCount} opportunities${skippedText}${errorText}`;
}

export default function useScanJobs({
  onRefresh,
  onScanCompleted,
  settings,
  watchlist,
}) {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(EMPTY_PROGRESS);
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState("");
  const pollingCancelledRef = useRef(false);

  const updateScanProgressFromJob = useCallback((job) => {
    const status = String(job?.status || "QUEUED").toLowerCase();
    const failed = ["failed", "cancelled", "timeout"].includes(status);
    const stage = String(job?.currentStage || "QUEUED").replaceAll("_", " ");
    const scanSummary = job?.metadata?.scanSummary || null;
    const processed = numberOrZero(
      job?.symbolsProcessed ?? scanSummary?.symbols_processed
    );
    const total = numberOrZero(job?.symbolsTotal ?? scanSummary?.symbols_considered);

    setProgress({
      visible: true,
      status:
        status === "completed" ? "complete" : failed ? "failed" : "running",
      percent: Number(job?.progress) || 0,
      elapsedSeconds: Number(job?.elapsedSeconds) || 0,
      remainingSeconds: Number(job?.etaSeconds) || 0,
      processed,
      total,
      stage,
      label: failed
        ? job?.metadata?.error || `Scan ${status}`
        : status === "completed"
          ? buildCompletedLabel(job)
          : "Running fresh scan...",
      summary: scanSummary,
    });
  }, []);

  const refreshAfterScan = useCallback(
    async (mergeResult = false) => {
      const response = await fetch(`${API_BASE_URL}/api/scan-results`);
      if (!response.ok) {
        throw new Error("Scan completed, but results could not be loaded.");
      }

      const nextData = await response.json();
      await onScanCompleted?.(nextData, { mergeResult });
      await onRefresh?.();
      return nextData;
    },
    [onRefresh, onScanCompleted]
  );

  const pollScanJob = useCallback(
    async (nextJobId, mergeResult = false) => {
      while (!pollingCancelledRef.current) {
        const response = await fetch(`${API_BASE_URL}/api/scans/${nextJobId}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to read scan status.");
        }

        const job = payload.job;
        updateScanProgressFromJob(job);
        if (job.status === "COMPLETED") {
          await refreshAfterScan(mergeResult);
          window.setTimeout(() => {
            setProgress((current) => ({ ...current, visible: false }));
          }, 2200);
          return job;
        }
        if (["FAILED", "CANCELLED", "TIMEOUT"].includes(job.status)) {
          throw new Error(job.metadata?.error || `Scan ${job.status.toLowerCase()}.`);
        }

        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }

      return null;
    },
    [refreshAfterScan, updateScanProgressFromJob]
  );

  const startScanJob = useCallback(
    async (body, { mergeResult = false } = {}) => {
      if (isScanning) return null;
      setIsScanning(true);
      setError("");
      pollingCancelledRef.current = false;
      setProgress(buildInitialProgress(body.limit));

      try {
        if (import.meta.env.DEV) {
          console.debug("Running scan via canonical path: /api/scans/start");
        }
        const response = await fetch(`${API_BASE_URL}/api/scans/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Unable to start scan.");
        }

        setJobId(payload.job.id);
        updateScanProgressFromJob(payload.job);
        return await pollScanJob(payload.job.id, mergeResult);
      } catch (err) {
        setError(err.message);
        setProgress((current) => ({
          ...current,
          visible: true,
          status: "failed",
          label: err.message || "Scan failed",
        }));
        return null;
      } finally {
        setIsScanning(false);
        setJobId("");
      }
    },
    [isScanning, pollScanJob, updateScanProgressFromJob]
  );

  const runScan = useCallback(async (options = {}) => {
    const scanWatchlistOnly =
      options?.watchlistOnly ?? Boolean(settings.scanWatchlistOnly);
    const requestedCount = scanWatchlistOnly
      ? Math.max(1, watchlist.size)
      : Number(settings.scanLimit);

    return startScanJob({
      limit: Number(settings.scanLimit),
      riskMultiplier: Number(settings.riskMultiplier),
      tradingHorizon: settings.tradingHorizon,
      executionSettings: settings.buildExecutionSettingsPayload(),
      marketUniverseSettings: settings.buildMarketUniverseSettingsPayload(),
      scanWatchlistOnly,
      watchlistSymbols: scanWatchlistOnly ? [...watchlist] : [],
      requestedCount,
    });
  }, [settings, startScanJob, watchlist]);

  const runWatchlistScan = useCallback(
    () => runScan({ watchlistOnly: true }),
    [runScan]
  );

  const runSymbolScan = useCallback(
    async (symbol) => {
      const normalizedSymbol = String(symbol || "").trim().toUpperCase();

      if (!/^[A-Z0-9.-]{1,12}$/.test(normalizedSymbol)) {
        setError("Enter a valid ticker symbol to scan.");
        return null;
      }

      return startScanJob(
        {
          limit: 1,
          riskMultiplier: Number(settings.riskMultiplier),
          tradingHorizon: settings.tradingHorizon,
          executionSettings: settings.buildExecutionSettingsPayload(),
          marketUniverseSettings: settings.buildMarketUniverseSettingsPayload(),
          scanSymbolsOnly: true,
          symbols: [normalizedSymbol],
        },
        { mergeResult: true }
      );
    },
    [settings, startScanJob]
  );

  const cancelScan = useCallback(async () => {
    if (!jobId) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/scans/${jobId}/cancel`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Unable to cancel scan.");
      }
      pollingCancelledRef.current = true;
      updateScanProgressFromJob(payload.job);
      setError("Scan cancelled.");
      setIsScanning(false);
      setJobId("");
    } catch (err) {
      setError(err.message);
    }
  }, [jobId, updateScanProgressFromJob]);

  useEffect(
    () => () => {
      pollingCancelledRef.current = true;
    },
    []
  );

  useEffect(() => {
    if (!settings.user || isScanning) return undefined;
    let disposed = false;

    const resumeActiveScan = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/scans/active`);
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.job || disposed) return;

        pollingCancelledRef.current = false;
        setJobId(payload.job.id);
        setIsScanning(true);
        updateScanProgressFromJob(payload.job);
        await pollScanJob(payload.job.id);
      } catch (err) {
        if (!disposed) {
          setError(err.message);
        }
      } finally {
        if (!disposed) {
          setIsScanning(false);
          setJobId("");
        }
      }
    };

    void resumeActiveScan();
    return () => {
      disposed = true;
    };
  }, [isScanning, pollScanJob, settings.user, updateScanProgressFromJob]);

  return {
    cancelScan,
    error,
    isScanning,
    jobId,
    progress,
    runScan,
    runWatchlistScan,
    runSymbolScan,
  };
}
