import { useCallback, useMemo, useRef, useState } from "react";
import {
  executeBrokerPaperApproval,
  getApprovalRequests,
  previewBrokerPaperExecution,
  runApprovalAction,
  updateApprovalRequest,
} from "../services/approvalsApi";

function buildExecutionBlockMessage(error) {
  return error?.block_reason || error?.pre_trade_analysis?.explanation || error?.message || "Execution was blocked.";
}

function buildOverrideDecisionNote(note, blockMessage) {
  const trimmedNote = String(note || "").trim();
  return trimmedNote || `Manual override requested. ${blockMessage}`;
}

function buildBrokerPreviewText(preview) {
  const previewOrder = preview?.order || {};
  const quote = preview?.marketData || {};
  const previewMeta = preview?.preview || {};
  const lines = [
    `Submit broker paper order for ${preview.symbol || "this symbol"}?`,
    "",
    `Side: ${previewOrder.side || "BUY"}`,
    `Quantity: ${previewOrder.quantity ?? "-"}`,
    `Order Type: ${previewOrder.orderType || previewOrder.order_type || "MARKET"}`,
    `Limit Price: ${
      previewOrder.limitPrice ?? previewOrder.limit_price ?? previewOrder.entryPrice ?? "Market"
    }`,
    `Reference Price: ${previewMeta.referencePrice ?? quote.last ?? quote.close ?? "-"}`,
    `Estimated Notional: ${previewMeta.estimatedNotional ?? "-"}`,
    `Buying Power Remaining: ${previewMeta.buyingPowerRemaining ?? "-"}`,
    `Trading Session: ${quote.tradingSession || "Regular"}`,
    `Market Status: ${quote.marketStatus || "Normal"}`,
    `Tradable: ${quote.tradable === false ? "No" : "Yes"}`,
    `Mode: ${previewMeta.mode || "PAPER_BROKER"}`,
  ];

  if (Array.isArray(previewMeta.notes) && previewMeta.notes.length > 0) {
    lines.push("", `Notes: ${previewMeta.notes.join(" ")}`);
  }

  return lines.join("\n");
}

export default function useApprovals({
  onActionCompleted,
  onBrokerPaperExecuted,
  onExecuted,
  onTradeEdited,
  paperBrokerEnabled = false,
  statuses,
} = {}) {
  const [approvalRequestsData, setApprovalRequestsData] = useState({
    approval_requests: [],
  });
  const [approvalActionId, setApprovalActionId] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("PENDING");
  const [selectedApprovalRequestId, setSelectedApprovalRequestId] = useState("");
  const [approvalNotes, setApprovalNotes] = useState({});
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationDialog, setConfirmationDialog] = useState(null);
  const confirmationResolverRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextApprovalRequests = await getApprovalRequests();
      setApprovalRequestsData(nextApprovalRequests);
      setError("");
      return nextApprovalRequests;
    } catch (err) {
      const fallback = { approval_requests: [], error: err.message };
      setApprovalRequestsData(fallback);
      setError(err.message);
      return fallback;
    } finally {
      setLoading(false);
    }
  }, []);

  const approvalRequests = useMemo(
    () => approvalRequestsData.approval_requests || approvalRequestsData.requests || [],
    [approvalRequestsData]
  );

  const approvalCounts = useMemo(
    () =>
      statuses.reduce((acc, status) => {
        acc[status] = approvalRequests.filter((request) => request.status === status).length;
        return acc;
      }, {}),
    [approvalRequests, statuses]
  );

  const visibleApprovalRequests = useMemo(
    () => approvalRequests.filter((request) => request.status === approvalFilter),
    [approvalFilter, approvalRequests]
  );

  const selectedApprovalRequest = useMemo(
    () =>
      visibleApprovalRequests.find((request) => request.id === selectedApprovalRequestId) ||
      visibleApprovalRequests[0] ||
      null,
    [selectedApprovalRequestId, visibleApprovalRequests]
  );

  const pendingApprovalRequests = useMemo(
    () => approvalRequests.filter((request) => request.status === "PENDING"),
    [approvalRequests]
  );

  const dashboardPendingApprovals = useMemo(
    () => pendingApprovalRequests.slice(0, 3),
    [pendingApprovalRequests]
  );

  const handleApprovalNoteChange = useCallback((id, value) => {
    setApprovalNotes((current) => ({
      ...current,
      [id]: value,
    }));
  }, []);

  const resolveConfirmation = useCallback((confirmed) => {
    const resolver = confirmationResolverRef.current;
    confirmationResolverRef.current = null;
    setConfirmationDialog(null);
    resolver?.(confirmed);
  }, []);

  const confirmDialog = useCallback(() => {
    resolveConfirmation(true);
  }, [resolveConfirmation]);

  const cancelDialog = useCallback(() => {
    resolveConfirmation(false);
  }, [resolveConfirmation]);

  const requestConfirmation = useCallback((dialogConfig) => {
    setConfirmationDialog({
      tone: "warning",
      cancelLabel: "Cancel",
      confirmLabel: "Continue",
      ...dialogConfig,
    });

    return new Promise((resolve) => {
      confirmationResolverRef.current = resolve;
    });
  }, []);

  const handleApprovalAction = useCallback(
    async (id, action) => {
      setApprovalActionId(id);
      setError("");
      setSuccessMessage("");

      try {
        const note = approvalNotes[id] || "";
        let result;
        let nextApprovalFilter = null;
        let nextSelectedApprovalId = "";

        if (action === "execute-broker-paper") {
          if (!paperBrokerEnabled) {
            throw new Error("Broker paper execution is not enabled.");
          }

          let preview;
          let brokerDecisionNote = note;
          let manualOverrideConfirmed = false;

          try {
            preview = await previewBrokerPaperExecution(id);
          } catch (err) {
            if (!err.override_eligible) {
              throw err;
            }

            const blockMessage = buildExecutionBlockMessage(err);
            const overrideConfirmed = await requestConfirmation({
              title: "Broker paper execution blocked",
              message: `Reason: ${blockMessage}\n\nOverride and continue to the broker order preview?`,
              confirmLabel: "Override and preview",
            });

            if (!overrideConfirmed) {
              throw err;
            }

            brokerDecisionNote = buildOverrideDecisionNote(note, blockMessage);
            manualOverrideConfirmed = true;
            preview = await previewBrokerPaperExecution(id, {
              decisionNote: brokerDecisionNote,
              manualOverride: true,
            });
          }

          const previewText = buildBrokerPreviewText(preview);

          if (
            !(await requestConfirmation({
              title: "Broker paper order preview",
              message: previewText,
              confirmLabel: "Submit order",
            }))
          ) {
            setApprovalActionId("");
            return;
          }

          try {
            result = await executeBrokerPaperApproval(id, {
              decisionNote: brokerDecisionNote,
              manualOverride: manualOverrideConfirmed,
            });
          } catch (err) {
            if (!err.override_eligible || manualOverrideConfirmed) {
              throw err;
            }

            const blockMessage = buildExecutionBlockMessage(err);
            const overrideConfirmed = await requestConfirmation({
              title: "Broker paper execution blocked",
              message: `Reason: ${blockMessage}\n\nOverride and submit the order anyway?`,
              confirmLabel: "Override and submit",
            });

            if (!overrideConfirmed) {
              throw err;
            }

            manualOverrideConfirmed = true;
            result = await executeBrokerPaperApproval(id, {
              decisionNote: buildOverrideDecisionNote(brokerDecisionNote, blockMessage),
              manualOverride: true,
            });
          }
          const normalizedBrokerStatus = String(
            result?.brokerOrder?.status || result?.paperExecution?.trade?.status || ""
          )
            .trim()
            .toUpperCase();
          const filledExecution =
            Boolean(result?.paperExecution) || normalizedBrokerStatus === "FILLED";
          if (filledExecution) {
            nextApprovalFilter = "EXECUTED";
            nextSelectedApprovalId = id;
            setSuccessMessage(
              `Broker paper order for ${
                result?.brokerOrder?.symbol || preview?.symbol || "this symbol"
              } executed successfully and moved to Executed approvals.`
            );
          } else {
            setSuccessMessage(
              `Broker paper order for ${
                result?.brokerOrder?.symbol || preview?.symbol || "this symbol"
              } was submitted to the broker and is syncing.`
            );
          }
          await onBrokerPaperExecuted?.({ action, id, result });
        } else if (action === "execute-paper") {
          try {
            result = await runApprovalAction(id, action, note);
          } catch (err) {
            if (!err.override_eligible) {
              throw err;
            }

            const blockMessage = buildExecutionBlockMessage(err);
            const overrideConfirmed = await requestConfirmation({
              title: "Paper execution blocked",
              message: `Reason: ${blockMessage}\n\nOverride and execute anyway?`,
              confirmLabel: "Override and execute",
            });

            if (!overrideConfirmed) {
              throw err;
            }

            result = await runApprovalAction(
              id,
              action,
              buildOverrideDecisionNote(note, blockMessage),
              { manualOverride: true }
            );
          }
          setSuccessMessage("Paper execution completed successfully.");
        } else {
          result = await runApprovalAction(id, action, note);
        }

        await refresh();
        if (nextApprovalFilter) {
          setApprovalFilter(nextApprovalFilter);
        }
        if (nextSelectedApprovalId) {
          setSelectedApprovalRequestId(nextSelectedApprovalId);
        }
        await onActionCompleted?.({ action, id, result });

        if (action === "execute-paper") {
          await onExecuted?.({ action, id, result });
        }
      } catch (err) {
        setError(buildExecutionBlockMessage(err));
      } finally {
        setApprovalActionId("");
      }
    },
    [
      approvalNotes,
      onActionCompleted,
      onBrokerPaperExecuted,
      onExecuted,
      paperBrokerEnabled,
      requestConfirmation,
      refresh,
    ]
  );

  const handleApprovalTradeEdit = useCallback(
    async (id, values) => {
      setApprovalActionId(id);
      setError("");

      try {
        const result = await updateApprovalRequest(id, values);
        await refresh();
        await onTradeEdited?.({ id, result });
        return result;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setApprovalActionId("");
      }
    },
    [onTradeEdited, refresh]
  );

  return {
    approvalActionId,
    approvalCounts,
    approvalFilter,
    approvalNotes,
    approvalRequests,
    approvalRequestsData,
      dashboardPendingApprovals,
    error,
    cancelDialog,
    confirmDialog,
    confirmationDialog,
    handleApprovalAction,
    handleApprovalNoteChange,
    handleApprovalTradeEdit,
    loading,
    pendingApprovalRequests,
    refresh,
    selectedApprovalRequest,
    setApprovalFilter,
    setSelectedApprovalRequestId,
    successMessage,
    visibleApprovalRequests,
  };
}
