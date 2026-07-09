import ApprovalFilters from "./components/ApprovalFilters";
import ApprovalQueueSummary from "./components/ApprovalQueueSummary";
import ApprovalRequestCard from "./components/ApprovalRequestCard";
import PreTradeSimulator from "./components/PreTradeSimulator";
import ConfirmDialog from "../../components/common/ConfirmDialog";

export default function ApprovalsPage({
  activeHorizonLabel,
  approvals,
  approvalStatuses,
  brokerPaperEnabled = false,
  brokerExecutionProvider = null,
  brokerPaperReason = "",
  formatMoney,
  formatRatioPercent,
  preTrade,
}) {
  const {
    approvalActionId,
    approvalCounts,
    approvalFilter,
    approvalNotes,
    approvalRequestsData = {},
    cancelDialog,
    confirmDialog,
    confirmationDialog,
    error,
    handleApprovalAction,
    handleApprovalNoteChange,
    handleApprovalTradeEdit,
    selectedApprovalRequest,
    setApprovalFilter,
    setSelectedApprovalRequestId,
    successMessage,
    visibleApprovalRequests,
  } = approvals;

  return (
    <section className="alerts-panel approval-queue-panel">
      <ConfirmDialog
        cancelLabel={confirmationDialog?.cancelLabel}
        confirmLabel={confirmationDialog?.confirmLabel}
        message={confirmationDialog?.message}
        onCancel={cancelDialog}
        onConfirm={confirmDialog}
        open={Boolean(confirmationDialog)}
        title={confirmationDialog?.title}
        tone={confirmationDialog?.tone}
      />
      <ApprovalQueueSummary
        approvalFilter={approvalFilter}
        visibleCount={visibleApprovalRequests.length}
      />

      <ApprovalFilters
        approvalCounts={approvalCounts}
        approvalFilter={approvalFilter}
        onFilterChange={setApprovalFilter}
        statuses={approvalStatuses}
      />

      {successMessage && <p className="approval-success-banner">{successMessage}</p>}
      {error && <p className="engine-error">{error}</p>}

      {visibleApprovalRequests.length > 0 ? (
        <div className="approval-workspace">
          <aside className="approval-sidebar">
            {visibleApprovalRequests.map((request) => {
              const riskLevel =
                request.riskLevel || request.preTradeAnalysisJson?.risk_level || "MEDIUM";
              const recommendation =
                request.recommendation ||
                request.preTradeAnalysisJson?.recommendation ||
                "REVIEW";

              return (
                <button
                  className={
                    selectedApprovalRequest?.id === request.id
                      ? "approval-sidebar-item active"
                      : "approval-sidebar-item"
                  }
                  key={request.id}
                  onClick={() => {
                    setSelectedApprovalRequestId(request.id);
                    preTrade.buildFromApproval(request);
                  }}
                  type="button"
                >
                  <div>
                    <strong>{request.symbol}</strong>
                    <span>{request.side || "BUY"} · Qty {Number(request.quantity || 0).toFixed(2)}</span>
                  </div>
                  <div className="approval-sidebar-metrics">
                    <span>Score {request.opportunityScore ?? "-"}</span>
                    <span>Conf {request.confidence ?? "-"}</span>
                  </div>
                  <div className="approval-sidebar-footer">
                    <span className={`risk-pill ${String(riskLevel).toLowerCase()}`}>
                      {riskLevel}
                    </span>
                    <span>{recommendation}</span>
                  </div>
                </button>
              );
            })}
          </aside>

          <div className="approval-detail-column">
            {selectedApprovalRequest && (
              <>
                <PreTradeSimulator
                  activeHorizonLabel={activeHorizonLabel}
                  formatMoney={formatMoney}
                  formatRatioPercent={formatRatioPercent}
                  preTrade={preTrade}
                />
                <ApprovalRequestCard
                  canExecuteBrokerPaper={brokerPaperEnabled}
                  brokerExecutionProvider={brokerExecutionProvider}
                  brokerPaperReason={brokerPaperReason}
                  actionId={approvalActionId}
                  formatMoney={formatMoney}
                  key={selectedApprovalRequest.id}
                  note={approvalNotes[selectedApprovalRequest.id]}
                  onAction={handleApprovalAction}
                  onEditTrade={handleApprovalTradeEdit}
                  onNoteChange={handleApprovalNoteChange}
                  request={selectedApprovalRequest}
                />
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="alerts-empty">
          {approvalRequestsData.error ||
            `No ${approvalFilter.toLowerCase()} approval requests.`}
        </p>
      )}
    </section>
  );
}
