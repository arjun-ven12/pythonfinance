function formatScanDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;

  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export default function ScanProgressPanel({ onCancel, progress }) {
  if (!progress?.visible) {
    return null;
  }

  const isFailed = progress.status === "failed";
  const isComplete = progress.status === "complete";

  return (
    <section
      aria-live="polite"
      className={`scan-progress-panel ${isFailed ? "failed" : ""} ${
        isComplete ? "complete" : ""
      }`}
    >
      <div className="scan-progress-copy">
        <div>
          <p className="eyebrow">
            {isFailed ? "Scan stopped" : isComplete ? "Scan complete" : "Live scan progress"}
          </p>
          <strong>{progress.label}</strong>
        </div>
        <div className="scan-progress-timing">
          <span>{Math.round(progress.percent)}%</span>
          <small>
            {isComplete || isFailed
              ? `Elapsed ${formatScanDuration(progress.elapsedSeconds)}`
              : `About ${formatScanDuration(progress.remainingSeconds)} remaining`}
          </small>
        </div>
      </div>
      <div
        aria-label="Scan progress"
        aria-valuemax="100"
        aria-valuemin="0"
        aria-valuenow={Math.round(progress.percent)}
        className="scan-progress-track"
        role="progressbar"
      >
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="scan-progress-footer">
        <p className="scan-progress-note">
          {progress.processed ?? 0} / {progress.total ?? 0} symbols
          {progress.stage ? ` · ${progress.stage}` : ""}
          {progress.summary?.skipped_count
            ? ` · ${progress.summary.skipped_count} skipped`
            : ""}
          {progress.summary?.error_count
            ? ` · ${progress.summary.error_count} errors`
            : ""}
        </p>
        {!isComplete && !isFailed && (
          <button
            className="scan-cancel-button"
            onClick={onCancel}
            type="button"
          >
            Cancel Scan
          </button>
        )}
      </div>
    </section>
  );
}
