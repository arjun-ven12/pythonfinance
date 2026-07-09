import { useState } from "react";

function formatMismatchLabel(status) {
  if (status === "MISSING_IN_APP") {
    return "Open in broker, not tracked by Quant's Trade";
  }
  if (status === "MISSING_AT_BROKER") {
    return "Tracked in Quant's Trade, absent from the current broker open-order list";
  }
  return String(status || "-").replaceAll("_", " ");
}

export default function ReconciliationTable({
  reconciliation,
  canSync = false,
  isSyncing = false,
  syncState = null,
  onSync = null,
  onImportOrder = null,
  onMarkOrderCancelled = null,
  onSyncOrder = null,
}) {
  const openOrderDifferences = reconciliation?.openOrderDifferences || [];
  const groupedOpenOrderDifferences = [
    {
      key: "missing-in-app",
      title: "Import from broker",
      description: "Orders that are still open at the broker but not yet tracked inside Quant's Trade.",
      rows: openOrderDifferences.filter((row) => row.status === "MISSING_IN_APP"),
    },
    {
      key: "missing-at-broker",
      title: "Refresh app status",
      description:
        "Orders tracked in Quant's Trade that are no longer present in the broker open-order list. These are often filled, cancelled, expired, or waiting for a status refresh.",
      rows: openOrderDifferences.filter((row) => row.status === "MISSING_AT_BROKER"),
    },
    {
      key: "other",
      title: "Other mismatches",
      description: "Open-order differences that need manual review.",
      rows: openOrderDifferences.filter(
        (row) => row.status !== "MISSING_IN_APP" && row.status !== "MISSING_AT_BROKER"
      ),
    },
  ].filter((group) => group.rows.length > 0);
  const [importingKey, setImportingKey] = useState("");
  const [syncingKey, setSyncingKey] = useState("");
  const [markingCancelledKey, setMarkingCancelledKey] = useState("");

  async function handleImport(row, index) {
    const key = `${row.brokerOrderId || "broker"}-${index}`;
    setImportingKey(key);
    try {
      await onImportOrder?.(row);
    } finally {
      setImportingKey("");
    }
  }

  async function handleSyncOrder(row, index) {
    const key = `${row.localOrderId || row.brokerOrderId || "broker"}-${index}`;
    setSyncingKey(key);
    try {
      await onSyncOrder?.(row);
    } finally {
      setSyncingKey("");
    }
  }

  async function handleMarkCancelled(row, index) {
    const key = `${row.localOrderId || row.brokerOrderId || "broker"}-${index}`;
    setMarkingCancelledKey(key);
    try {
      await onMarkOrderCancelled?.(row);
    } finally {
      setMarkingCancelledKey("");
    }
  }

  return (
    <article className="ibkr-card">
      <div className="broker-card-header">
        <div><p className="eyebrow">Reconciliation</p><h3>Paper Ledger vs Broker</h3></div>
        <span className={`ibkr-status ${String(reconciliation?.status || "warning").toLowerCase()}`}>{reconciliation?.syncScore ?? 0}% sync</span>
      </div>
      {reconciliation?.brokerReason && <p className="ibkr-note">{reconciliation.brokerReason}</p>}
      {syncState?.status && syncState.status !== "IDLE" ? (
        <div
          className={`broker-sync-notice ${
            syncState.status === "FAILED"
              ? "warning"
              : syncState.status === "SUCCESS"
                ? "success"
                : "active"
          }`}
        >
          <div className="broker-sync-notice__copy">
            <strong>
              {syncState.status === "FAILED"
                ? "Broker reconciliation needs attention"
                : syncState.status === "SUCCESS"
                  ? "Broker successfully synchronized."
                  : "Broker reconciliation in progress..."}
            </strong>
            <span>
              {syncState.error ||
                syncState.message ||
                "Reconciling broker cash and positions in the background."}
            </span>
          </div>
          <div className="broker-sync-notice__actions">
            {isSyncing ? <span className="status-pill info">Syncing</span> : null}
            {syncState.status === "FAILED" && canSync ? (
              <button type="button" disabled={isSyncing} onClick={onSync}>
                Retry Sync
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {canSync ? (
        <div className="broker-reconciliation-actions">
          <div className="broker-reconciliation-actions__copy">
            <strong>Ledger sync</strong>
            <span>
              Import current broker paper cash and positions into the cockpit ledger to clear
              reconciliation drift.
            </span>
          </div>
          <button type="button" onClick={onSync} disabled={isSyncing}>
            {isSyncing ? "Syncing ledger..." : "Sync Ledger From Broker"}
          </button>
        </div>
      ) : null}
      <dl className="ibkr-status-grid">
        <div><dt>Status</dt><dd>{reconciliation?.status || "Warning"}</dd></div>
        <div><dt>Cash Difference</dt><dd>{reconciliation?.cashDifference == null ? "Unavailable" : reconciliation.cashDifference.toFixed(2)}</dd></div>
        <div><dt>Missing Positions</dt><dd>{reconciliation?.missingPositions?.length || 0}</dd></div>
        <div><dt>Extra Positions</dt><dd>{reconciliation?.extraPositions?.length || 0}</dd></div>
      </dl>
      {openOrderDifferences.length ? (
        <p className="ibkr-note">
          Open-order drift still detected: {openOrderDifferences.length} broker/app mismatch
          {openOrderDifferences.length === 1 ? "" : "es"}.
        </p>
      ) : null}
      <div className="broker-reconciliation-table">
        <div className="broker-table-head"><span>Symbol</span><span>Paper Qty</span><span>Broker Qty</span><span>Diff</span></div>
        {(reconciliation?.positionDifferences || []).length ? reconciliation.positionDifferences.map((row) => (
          <div className="broker-table-row" key={row.symbol}><strong>{row.symbol}</strong><span>{row.paperQuantity}</span><span>{row.brokerQuantity}</span><span>{row.quantityDifference}</span></div>
        )) : <p className="alerts-empty">No position differences available.</p>}
      </div>
      {openOrderDifferences.length ? (
        <div className="broker-reconciliation-table">
          <div className="broker-card-header broker-subtable-header">
            <div>
              <p className="eyebrow">Open Orders</p>
              <h3>Open-order drift details</h3>
            </div>
            <span className="ibkr-status warning">{openOrderDifferences.length} mismatches</span>
          </div>
          <div className="broker-table-head broker-order-drift-grid">
            <span>Symbol</span>
            <span>Mismatch</span>
            <span>Client / App Ref</span>
            <span>Broker Order ID</span>
            <span>Actions</span>
          </div>
          {groupedOpenOrderDifferences.map((group) => (
            <div className="broker-order-group" key={group.key}>
              <div className="broker-order-group__header">
                <strong>{group.title}</strong>
                <span>{group.description}</span>
              </div>
              {group.rows.map((row, index) => (
                <div
                  className="broker-table-row broker-order-drift-grid"
                  key={`${group.key}-${row.clientOrderId || "app"}-${row.brokerOrderId || "broker"}-${row.symbol || "unknown"}-${index}`}
                >
                  <strong>{row.symbol || "-"}</strong>
                  <span>{formatMismatchLabel(row.status)}</span>
                  <span>{row.clientOrderId || "-"}</span>
                  <span>{row.brokerOrderId || "-"}</span>
                  <div className="broker-order-actions">
                    {row.status === "MISSING_IN_APP" ? (
                      <button
                        type="button"
                        disabled={importingKey === `${row.brokerOrderId || "broker"}-${index}`}
                        onClick={() => handleImport(row, index)}
                      >
                        {importingKey === `${row.brokerOrderId || "broker"}-${index}`
                          ? "Importing..."
                          : "Import"}
                      </button>
                    ) : row.status === "MISSING_AT_BROKER" && row.localOrderId ? (
                      <>
                        <button
                          type="button"
                          disabled={syncingKey === `${row.localOrderId || row.brokerOrderId || "broker"}-${index}`}
                          onClick={() => handleSyncOrder(row, index)}
                        >
                          {syncingKey === `${row.localOrderId || row.brokerOrderId || "broker"}-${index}`
                            ? "Syncing..."
                            : "Sync Status"}
                        </button>
                        <button
                          type="button"
                          disabled={markingCancelledKey === `${row.localOrderId || row.brokerOrderId || "broker"}-${index}`}
                          onClick={() => handleMarkCancelled(row, index)}
                        >
                          {markingCancelledKey === `${row.localOrderId || row.brokerOrderId || "broker"}-${index}`
                            ? "Marking..."
                            : "Mark Cancelled"}
                        </button>
                      </>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
