import { useState } from "react";
import formatJsonSummary from "../../../utils/formatJsonSummary";
import { buildApprovalEditForm } from "../utils/approvalForms";
import ApprovalTimeline from "./ApprovalTimeline";

const EXECUTION_MODES = {
  MANUAL_APPROVAL: "Manual Approval",
  SEMI_AUTOMATED: "Semi-Automated",
  FULL_AUTOMATION: "Full Automation",
};

export default function ApprovalRequestCard({
  canExecuteBrokerPaper = false,
  brokerExecutionProvider = null,
  brokerPaperReason = "",
  actionId,
  formatMoney,
  note,
  onAction,
  onEditTrade,
  onNoteChange,
  request,
}) {
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [isEditingTrade, setIsEditingTrade] = useState(false);
  const [editForm, setEditForm] = useState(() => buildApprovalEditForm(request));
  const status = request.status || "PENDING";
  const canExecutePaper = status === "APPROVED";
  const canEditTrade = !["EXECUTED", "REJECTED"].includes(status);
  const riskLevel = request.riskLevel || request.preTradeAnalysisJson?.risk_level || "MEDIUM";
  const recommendation =
    request.recommendation || request.preTradeAnalysisJson?.recommendation || "-";
  const reasons = request.reason || request.preTradeAnalysisJson?.explanation || "-";
  const safetyViolations =
    request.safetyViolationsJson || request.preTradeAnalysisJson?.safety_violations || [];
  const newsEvents =
    request.newsEventsJson || request.preTradeAnalysisJson?.upcoming_events || [];
  const openaiReasoning =
    request.openaiReasoningJson || request.preTradeAnalysisJson?.news_reasoning || {};
  const preTrade = request.preTradeAnalysisJson || {};
  const rawStrategyAudit = request.raw?.strategy_audit || {};
  const strategyName =
    request.strategyName ||
    request.strategy_name ||
    preTrade.strategy_name ||
    preTrade.strategy?.name ||
    rawStrategyAudit.strategy_name ||
    "Active scanner strategy";
  const strategySource =
    request.strategySource ||
    request.strategy_source ||
    preTrade.strategy_source ||
    preTrade.strategy?.source ||
    rawStrategyAudit.strategy_source ||
    "Scanner / Strategy Lab";
  const strategyConfig =
    request.strategyConfig ||
    request.strategy_config ||
    preTrade.strategy_config ||
    preTrade.strategy?.settings ||
    rawStrategyAudit.strategy_config ||
    {};
  const strategyVersionId =
    request.strategyVersionId ||
    request.strategy_version_id ||
    preTrade.strategy_version_id ||
    preTrade.strategyVersionId ||
    rawStrategyAudit.strategyVersionId ||
    rawStrategyAudit.strategy_version_id ||
    request.raw?.strategyVersionId ||
    request.raw?.active_strategy_config?.strategyVersionId ||
    strategyConfig.strategy_version_id ||
    strategyConfig.strategyVersionId ||
    "Default";
  const suggestionBasis =
    request.suggestionBasis ||
    request.suggestion_basis ||
    preTrade.suggestion_basis ||
    rawStrategyAudit.suggestion_basis ||
    {};
  const formatAuditObject = (value, fallback) => {
    if (!value || (typeof value === "object" && Object.keys(value).length === 0)) {
      return fallback;
    }

    if (typeof value !== "object" || Array.isArray(value)) {
      return formatJsonSummary(value, fallback);
    }

    return Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== "")
      .slice(0, 8)
      .map(([key, entryValue]) => `${key}: ${entryValue}`)
      .join("; ");
  };
  const confidenceBreakdown =
    preTrade.confidence_breakdown ||
    request.confidenceBreakdownJson ||
    request.confidence_breakdown ||
    {};
  const manualEdit = request.raw?.manual_edit;
  const auditTrail = [
    {
      title: "1. Strategy Used",
      status: `${strategyName} · ${strategyVersionId}`,
      body: `${strategySource}. Version: ${strategyVersionId}. Settings: ${formatAuditObject(
        strategyConfig,
        "No saved strategy settings attached."
      )}`,
    },
    {
      title: "2. Technical Strategy Signal",
      status: request.symbol,
      body:
        request.reason ||
        preTrade.signal_reason ||
        "Base scanner signal comes from the active EMA/RSI trend strategy.",
    },
    {
      title: "3. Confidence And Score",
      status: `Confidence ${request.confidence ?? "-"} / Score ${request.opportunityScore ?? "-"}`,
      body: formatAuditObject(
        suggestionBasis || confidenceBreakdown,
        "Confidence was taken from the scanner opportunity attached to this proposed trade."
      ),
    },
    {
      title: "4. News And Events",
      status: newsEvents.length ? `${newsEvents.length} event(s)` : "No blocking events recorded",
      body: formatJsonSummary(newsEvents, "No news events were attached to this request."),
    },
    {
      title: "5. OpenAI Risk Reasoning",
      status: openaiReasoning.risk_level || openaiReasoning.sentiment || "No AI risk flag",
      body: formatJsonSummary(openaiReasoning, "No OpenAI reasoning was attached to this request."),
    },
    {
      title: "6. Safety Manager",
      status: safetyViolations.length ? `${safetyViolations.length} violation(s)` : "No violations",
      body: formatJsonSummary(safetyViolations, "No safety violations recorded."),
    },
    {
      title: "7. Pre-Trade Decision",
      status: recommendation,
      body:
        preTrade.explanation ||
        "Approval workflow requires human review before paper execution.",
    },
    ...(manualEdit
      ? [
          {
            title: "8. Manual Trade Edit",
            status: new Date(manualEdit.edited_at).toLocaleString(),
            body: `Previous: ${formatJsonSummary(
              manualEdit.previous,
              "No previous values recorded."
            )} Updated: ${formatJsonSummary(
              manualEdit.updated,
              "No updated values recorded."
            )}`,
          },
        ]
      : []),
  ];
  const isBusy = actionId === request.id;
  const isHighRiskApproval =
    Boolean(request.raw?.high_risk_flag) ||
    Boolean(preTrade.high_risk_flag) ||
    Boolean(request.raw?.order?.high_risk_flag);
  const normalizedBrokerProvider = String(brokerExecutionProvider || "").trim().toUpperCase();
  const brokerProviderLabel = normalizedBrokerProvider
    ? normalizedBrokerProvider.replaceAll("_", " ")
    : "Broker";
  const brokerExecutionLabel = normalizedBrokerProvider
    ? `Execute ${brokerProviderLabel} Paper Order`
    : "Execute Broker Paper Order";
  const hasBrokerRoute =
    normalizedBrokerProvider && normalizedBrokerProvider !== "INTERNAL_PAPER";
  const disableInternalPaperExecution =
    canExecuteBrokerPaper && hasBrokerRoute;
  const highRiskWarnings =
    request.raw?.high_risk_warnings ||
    request.raw?.order?.high_risk_warnings ||
    preTrade.high_risk_warnings ||
    [];
  const ledgerImpact = request.estimatedLedgerImpact || {};

  const handleEditFormChange = (field, value) => {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveTradeEdit = async () => {
    try {
      await onEditTrade(request.id, {
        ...editForm,
        decisionNote: note || "",
      });
      setIsEditingTrade(false);
    } catch {
      // Error state is displayed by the parent approval panel.
    }
  };

  return (
    <article className="approval-card">
      <div className="approval-card-header">
        <div>
          <p className="eyebrow">Approval request</p>
          <h3>{request.symbol}</h3>
        </div>
        <div className="approval-card-badges">
          <span className={`badge ${String(request.side || "BUY").toLowerCase()}`}>
            {request.side || "BUY"}
          </span>
          <span className={`risk-pill ${String(riskLevel).toLowerCase()}`}>
            {riskLevel} risk
          </span>
          <span className={`approval-status ${status.toLowerCase()}`}>{status}</span>
          {isHighRiskApproval && <span className="risk-pill high">HIGH-RISK</span>}
        </div>
      </div>

      {isHighRiskApproval && (
        <p className="strategy-sync-warning">
          High-risk universe trade requires manual review. Auto-execution is disabled.
          {highRiskWarnings.length > 0 ? ` ${highRiskWarnings.join(" ")}` : ""}
        </p>
      )}

      <dl className="approval-metrics">
        <div>
          <dt>Quantity</dt>
          <dd>{Number(request.quantity || 0).toFixed(2)}</dd>
        </div>
        <div>
          <dt>Entry</dt>
          <dd>{formatMoney(request.entryPrice)}</dd>
        </div>
        <div>
          <dt>Stop</dt>
          <dd>{formatMoney(request.stopLoss)}</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{formatMoney(request.takeProfit)}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{request.confidence == null ? "-" : Number(request.confidence).toFixed(2)}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>
            {request.opportunityScore == null
              ? "-"
              : Number(request.opportunityScore).toFixed(2)}
          </dd>
        </div>
        <div>
          <dt>Recommendation</dt>
          <dd>{recommendation}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{EXECUTION_MODES[request.approvalMode] || request.approvalMode}</dd>
        </div>
      </dl>

      <section className="approval-ledger-impact">
        <div>
          <span>Estimated ledger impact</span>
          <strong>
            {Array.isArray(ledgerImpact.eventTypes)
              ? ledgerImpact.eventTypes.join(" → ")
              : "Calculated before execution"}
          </strong>
        </div>
        <dl>
          <div>
            <dt>Cash delta</dt>
            <dd>{formatMoney(ledgerImpact.cashDelta)}</dd>
          </div>
          <div>
            <dt>Position delta</dt>
            <dd>{ledgerImpact.positionDelta ?? "-"}</dd>
          </div>
          <div>
            <dt>Cash after</dt>
            <dd>{formatMoney(ledgerImpact.cashAfter)}</dd>
          </div>
          <div>
            <dt>Estimated notional</dt>
            <dd>{formatMoney(ledgerImpact.estimatedNotional)}</dd>
          </div>
        </dl>
        {ledgerImpact.wouldMakeCashNegative && (
          <p>Execution is blocked because this trade would make cash negative.</p>
        )}
      </section>

      <div className="approval-detail-grid">
        <div>
          <span>Reasons</span>
          <p>{reasons}</p>
        </div>
        <div>
          <span>Safety violations</span>
          <p>{formatJsonSummary(safetyViolations, "No safety violations recorded.")}</p>
        </div>
        <div>
          <span>News events</span>
          <p>{formatJsonSummary(newsEvents, "No news events recorded.")}</p>
        </div>
        <div>
          <span>OpenAI reasoning</span>
          <p>{formatJsonSummary(openaiReasoning, "No OpenAI reasoning recorded.")}</p>
        </div>
      </div>

      <ApprovalTimeline request={request} />

      {manualEdit && (
        <p className="strategy-sync-warning">
          Trade edited manually at {new Date(manualEdit.edited_at).toLocaleString()}.
          {manualEdit.note ? ` Note: ${manualEdit.note}` : ""}
        </p>
      )}

      <div className="approval-edit-panel">
        <div className="approval-edit-header">
          <div>
            <span>Suggested trade</span>
            <strong>{isEditingTrade ? "Editing proposed order" : "Review or adjust before approval"}</strong>
          </div>
          <button
            className="direction-toggle"
            disabled={isBusy || !canEditTrade}
            onClick={() => {
              setEditForm(buildApprovalEditForm(request));
              setIsEditingTrade((current) => !current);
            }}
            type="button"
          >
            {isEditingTrade ? "Cancel Edit" : "Edit Trade"}
          </button>
        </div>

        {isEditingTrade && (
          <div className="approval-edit-form">
            <label>
              <span>Quantity</span>
              <input
                min="0"
                onChange={(event) => handleEditFormChange("quantity", event.target.value)}
                step="0.01"
                type="number"
                value={editForm.quantity}
              />
            </label>
            <label>
              <span>Entry price</span>
              <input
                min="0"
                onChange={(event) => handleEditFormChange("entryPrice", event.target.value)}
                step="0.01"
                type="number"
                value={editForm.entryPrice}
              />
            </label>
            <label>
              <span>Stop loss</span>
              <input
                min="0"
                onChange={(event) => handleEditFormChange("stopLoss", event.target.value)}
                step="0.01"
                type="number"
                value={editForm.stopLoss}
              />
            </label>
            <label>
              <span>Take profit</span>
              <input
                min="0"
                onChange={(event) => handleEditFormChange("takeProfit", event.target.value)}
                step="0.01"
                type="number"
                value={editForm.takeProfit}
              />
            </label>
            <button
              disabled={isBusy}
              onClick={handleSaveTradeEdit}
              type="button"
            >
              Save Trade Edits
            </button>
          </div>
        )}
      </div>

      <div className="approval-audit-panel">
        <button
          className="direction-toggle"
          onClick={() => setShowAuditTrail((current) => !current)}
          type="button"
        >
          {showAuditTrail ? "Hide Audit Trail" : "View Audit Trail"}
        </button>

        {showAuditTrail && (
          <div className="approval-audit-list">
            {auditTrail.map((item) => (
              <article key={item.title}>
                <span>{item.title}</span>
                <strong>{item.status}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="approval-note-row">
        <label htmlFor={`approval-note-${request.id}`}>
          <span>Decision note</span>
          <input
            id={`approval-note-${request.id}`}
            onChange={(event) => onNoteChange(request.id, event.target.value)}
            placeholder="Optional note for reject or snooze"
            value={note || ""}
          />
        </label>
      </div>

      <div className="approval-execution-guidance">
        <article className="approval-execution-card">
          <span>Internal Paper</span>
          <strong>App ledger only</strong>
          <p>Updates the cockpit paper portfolio and journal, but does not send an order to the connected broker.</p>
        </article>
        {hasBrokerRoute && (
          <article className="approval-execution-card broker-route">
            <span>{brokerProviderLabel}</span>
            <strong>{canExecuteBrokerPaper ? "Broker simulator route" : "Broker route unavailable"}</strong>
            <p>
              {canExecuteBrokerPaper
                ? [
                    "Routes this approval to the connected broker paper environment so it can appear in the broker account and order list.",
                    brokerPaperReason,
                  ]
                    .filter(Boolean)
                    .join(" ")
                : brokerPaperReason || "Broker paper routing is currently unavailable."}
            </p>
          </article>
        )}
      </div>

      <div className="approval-actions">
        <button
          className="approval-action approve-action"
          disabled={isBusy || status === "APPROVED" || status === "EXECUTED"}
          onClick={() => onAction(request.id, "approve")}
          type="button"
        >
          Approve
        </button>
        <button
          className="approval-action reject-action"
          disabled={isBusy || status === "REJECTED" || status === "EXECUTED"}
          onClick={() => onAction(request.id, "reject")}
          type="button"
        >
          Reject
        </button>
        <button
          className="approval-action snooze-action"
          disabled={isBusy || status === "SNOOZED" || status === "EXECUTED"}
          onClick={() => onAction(request.id, "snooze")}
          type="button"
        >
          Snooze
        </button>
        <button
          className="approval-action"
          disabled={isBusy || !canExecutePaper || disableInternalPaperExecution}
          onClick={() => onAction(request.id, "execute-paper")}
          type="button"
          title={
            disableInternalPaperExecution
              ? `${brokerProviderLabel} broker routing is active. Use the broker paper action to send this order to the connected broker simulator.`
              : "Execute inside the app's internal paper ledger only."
          }
        >
          Execute Internal Paper Order
        </button>
        {hasBrokerRoute && (
          <button
            className="approval-action approve-action"
            disabled={isBusy || !canExecutePaper || !canExecuteBrokerPaper}
            onClick={() => onAction(request.id, "execute-broker-paper")}
            type="button"
            title={
              canExecuteBrokerPaper
                ? `Route this order into the ${brokerProviderLabel} paper environment.`
                : brokerPaperReason || "Broker paper routing is currently unavailable."
            }
          >
            {brokerExecutionLabel}
          </button>
        )}
      </div>
    </article>
  );
}
