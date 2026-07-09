function createApprovalsController(deps) {
  const {
    buildApprovalRequestData,
    buildApprovalTradeEditData,
    estimateLedgerImpact,
    executeBrokerPaperOrder,
    getApprovalRequestById,
    getDecisionNote,
    getPortfolioForUser,
    getRequestOrderPayload,
    listApprovalRequests,
    persistPaperExecutionResult,
    persistProposedTradeEditFromApproval,
    proposedTradeToOrder,
    runPaperOrder,
    runPreTradeAnalysis,
    syncApprovalRequestsFromProposedOrders,
    transitionApprovalRequest,
    updateApprovalRequestRecord,
    createApprovalRequestRecord,
  } = deps;

  function normalizeManualOverride(value) {
    if (typeof value === "boolean") return value;
    if (value == null) return false;
    return String(value).trim().toLowerCase() === "true";
  }

  function getExecutionBlockReason(preTradeAnalysis = {}) {
    return (
      preTradeAnalysis?.explanation ||
      preTradeAnalysis?.safety_violations?.[0] ||
      preTradeAnalysis?.checklist?.[0] ||
      preTradeAnalysis?.news_reasoning?.reasoning ||
      "Pre-trade analysis flagged this approval for manual review."
    );
  }

  function preserveStrategyAttribution(request, preTradeAnalysis = {}) {
    const existingPreTrade =
      request?.preTradeAnalysisJson && typeof request.preTradeAnalysisJson === "object"
        ? request.preTradeAnalysisJson
        : {};
    const existingRaw =
      request?.raw && typeof request.raw === "object" ? request.raw : {};
    const existingStrategyAudit =
      existingRaw.strategy_audit && typeof existingRaw.strategy_audit === "object"
        ? existingRaw.strategy_audit
        : {};
    const strategyVersionId =
      existingRaw.latest_scan?.strategyVersionId ||
      existingRaw.latest_scan?.strategy_version_id ||
      existingRaw.order?.strategyVersionId ||
      existingRaw.order?.strategy_version_id ||
      existingRaw.order?.strategyConfig?.strategyVersionId ||
      existingRaw.order?.strategyConfig?.strategy_version_id ||
      existingRaw.order?.strategy_config?.strategyVersionId ||
      existingRaw.order?.strategy_config?.strategy_version_id ||
      existingRaw.order?.active_strategy?.strategyVersionId ||
      existingRaw.order?.active_strategy?.strategy_version_id ||
      existingRaw.order?.active_strategy_config?.strategyVersionId ||
      existingRaw.order?.active_strategy_config?.strategy_version_id ||
      existingRaw.strategyVersionId ||
      existingRaw.strategy_version_id ||
      existingRaw.active_strategy?.strategyVersionId ||
      existingRaw.active_strategy?.strategy_version_id ||
      existingStrategyAudit.strategyVersionId ||
      existingStrategyAudit.strategy_version_id ||
      existingRaw.active_strategy_config?.strategyVersionId ||
      existingRaw.latest_scan?.raw?.strategyVersionId ||
      existingRaw.latest_scan?.raw?.strategy_version_id ||
      existingRaw.latest_scan?.raw?.active_strategy?.strategyVersionId ||
      existingRaw.latest_scan?.raw?.active_strategy?.strategy_version_id ||
      existingRaw.latest_scan?.raw?.active_strategy_config?.strategyVersionId ||
      existingRaw.latest_scan?.raw?.active_strategy_config?.strategy_version_id ||
      existingRaw.latest_scan?.raw?.strategy_config?.strategyVersionId ||
      existingRaw.latest_scan?.raw?.strategy_config?.strategy_version_id ||
      existingPreTrade.strategyVersionId ||
      existingPreTrade.strategy_version_id ||
      existingPreTrade.strategy?.versionId ||
      existingPreTrade.strategy?.strategyVersionId ||
      existingPreTrade.latest_scan?.strategyVersionId ||
      existingPreTrade.latest_scan?.strategy_version_id ||
      existingPreTrade.latest_scan?.raw?.strategyVersionId ||
      existingPreTrade.latest_scan?.raw?.strategy_version_id ||
      existingPreTrade.latest_scan?.raw?.active_strategy?.strategyVersionId ||
      existingPreTrade.latest_scan?.raw?.active_strategy?.strategy_version_id ||
      existingPreTrade.latest_scan?.raw?.active_strategy_config?.strategyVersionId ||
      existingPreTrade.latest_scan?.raw?.active_strategy_config?.strategy_version_id ||
      existingPreTrade.latest_scan?.raw?.strategy_config?.strategyVersionId ||
      existingPreTrade.latest_scan?.raw?.strategy_config?.strategy_version_id ||
      preTradeAnalysis.strategyVersionId ||
      preTradeAnalysis.strategy_version_id ||
      preTradeAnalysis.strategy?.versionId ||
      preTradeAnalysis.strategy?.strategyVersionId ||
      null;
    const activeStrategyConfig =
      existingRaw.active_strategy_config ||
      existingRaw.latest_scan?.raw?.active_strategy_config ||
      existingRaw.latest_scan?.raw?.strategy_config ||
      existingPreTrade.active_strategy_config ||
      existingPreTrade.latest_scan?.raw?.active_strategy_config ||
      existingPreTrade.latest_scan?.raw?.strategy_config ||
      preTradeAnalysis.active_strategy_config ||
      preTradeAnalysis.latest_scan?.raw?.active_strategy_config ||
      preTradeAnalysis.latest_scan?.raw?.strategy_config ||
      null;

    return {
      ...preTradeAnalysis,
      strategyVersionId: strategyVersionId || null,
      strategy_version_id: strategyVersionId || null,
      strategy_name:
        preTradeAnalysis.strategy_name ||
        existingPreTrade.strategy_name ||
        existingStrategyAudit.strategy_name ||
        null,
      strategy_source:
        preTradeAnalysis.strategy_source ||
        existingPreTrade.strategy_source ||
        existingStrategyAudit.strategy_source ||
        null,
      strategy_config:
        preTradeAnalysis.strategy_config ||
        existingPreTrade.strategy_config ||
        existingStrategyAudit.strategy_config ||
        null,
      suggestion_basis:
        preTradeAnalysis.suggestion_basis ||
        existingPreTrade.suggestion_basis ||
        existingStrategyAudit.suggestion_basis ||
        null,
      active_strategy_config: activeStrategyConfig,
      strategy: {
        ...(existingPreTrade.strategy || {}),
        ...(preTradeAnalysis.strategy || {}),
        versionId:
          preTradeAnalysis.strategy?.versionId ||
          preTradeAnalysis.strategy?.strategyVersionId ||
          existingPreTrade.strategy?.versionId ||
          existingPreTrade.strategy?.strategyVersionId ||
          strategyVersionId ||
          null,
        strategyVersionId:
          preTradeAnalysis.strategy?.strategyVersionId ||
          preTradeAnalysis.strategy?.versionId ||
          existingPreTrade.strategy?.strategyVersionId ||
          existingPreTrade.strategy?.versionId ||
          strategyVersionId ||
          null,
      },
    };
  }

  return {
    async listApprovalRequests(req, res) {
      try {
        await syncApprovalRequestsFromProposedOrders(req.user.id);
        const [requests, portfolio] = await Promise.all([
          listApprovalRequests(req.user.id),
          getPortfolioForUser(req.user.id),
        ]);
        res.json({
          approval_requests: requests.map((request) => ({
            ...request,
            estimatedLedgerImpact: estimateLedgerImpact(
              request,
              portfolio.ledgerState.cash
            ),
          })),
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async getApprovalRequest(req, res) {
      try {
        const request = await getApprovalRequestById(req.params.id, req.user.id);

        if (!request) {
          res.status(404).json({ error: "Approval request not found." });
          return;
        }

        const portfolio = await getPortfolioForUser(req.user.id);
        res.json({
          ...request,
          estimatedLedgerImpact: estimateLedgerImpact(
            request,
            portfolio.ledgerState.cash
          ),
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    },

    async createApprovalRequest(req, res) {
      try {
        const request = await createApprovalRequestRecord(
          buildApprovalRequestData(req.body || {}),
          req.user.id
        );
        res.status(201).json(request);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    },

    async updateApprovalRequest(req, res) {
      try {
        const existingRequest = await getApprovalRequestById(
          req.params.id,
          req.user.id
        );

        if (!existingRequest) {
          res.status(404).json({ error: "Approval request not found." });
          return;
        }

        const request = await updateApprovalRequestRecord(
          req.params.id,
          buildApprovalTradeEditData(existingRequest, req.body || {}),
          req.user.id
        );
        const proposedTrade = await persistProposedTradeEditFromApproval(
          existingRequest,
          request,
          req.body || {},
          req.user.id
        );
        res.json({
          ...request,
          proposed_trade: proposedTrade ? proposedTradeToOrder(proposedTrade) : null,
        });
      } catch (error) {
        res.status(error.message.includes("not found") ? 404 : 400).json({
          error: error.message,
        });
      }
    },

    async transition(req, res) {
      try {
        const request = await transitionApprovalRequest({
          id: req.params.id,
          userId: req.user.id,
          toStatus: req.toStatus,
          decisionNote: getDecisionNote(req.body || {}) || null,
        });
        res.json(request);
      } catch (error) {
        res.status(error.statusCode || 409).json({
          error: error.message,
        });
      }
    },

    async executePaper(req, res) {
      try {
        const manualOverride = normalizeManualOverride(
          req.body?.manualOverride ?? req.body?.forceExecute
        );
        const request = await getApprovalRequestById(req.params.id, req.user.id);

        if (!request) {
          res.status(404).json({ error: "Approval request not found." });
          return;
        }

        if (request.status !== "APPROVED") {
          res.status(409).json({
            error: "Approval request must be APPROVED before paper execution.",
            approval_request: request,
          });
          return;
        }

        const preTradeAnalysis = await runPreTradeAnalysis(req.user.id, {
          symbol: request.symbol,
          side: request.side,
          quantity: request.quantity,
          entryPrice: request.entryPrice,
          stopLoss: request.stopLoss,
          takeProfit: request.takeProfit,
          simulationMode: true,
        });

        const attributedPreTradeAnalysis = preserveStrategyAttribution(
          request,
          preTradeAnalysis
        );
        const analysisUpdate = {
          preTradeAnalysisJson: attributedPreTradeAnalysis,
          safetyViolationsJson: preTradeAnalysis.safety_violations || [],
          newsEventsJson: preTradeAnalysis.upcoming_events || [],
          openaiReasoningJson: preTradeAnalysis.news_reasoning || {},
        };
        const blockReason = getExecutionBlockReason(preTradeAnalysis);

        if (!preTradeAnalysis.allow_trade && !manualOverride) {
          const updated = await updateApprovalRequestRecord(req.params.id, {
            ...analysisUpdate,
            riskLevel: preTradeAnalysis.risk_level || request.riskLevel,
            recommendation: preTradeAnalysis.recommendation || request.recommendation,
            decisionNote:
              getDecisionNote(req.body || {}) ||
              `Paper execution blocked: ${blockReason}`,
          }, req.user.id);
          res.status(409).json({
            error: "Paper execution blocked by pre-trade analysis.",
            block_reason: blockReason,
            override_eligible: true,
            approval_request: updated,
            pre_trade_analysis: preTradeAnalysis,
          });
          return;
        }

        const paperResult = await runPaperOrder(
          getRequestOrderPayload(request),
          req.user.id
        );

        if (!paperResult.filled) {
          res.status(202).json({
            approval_request: request,
            pre_trade_analysis: preTradeAnalysis,
            paper_execution: paperResult,
          });
          return;
        }

        const updated = await persistPaperExecutionResult(
          req.user.id,
          request.id,
          paperResult,
          {
            ...analysisUpdate,
            raw: {
              paper_execution: paperResult,
              manual_override: manualOverride
                ? {
                    applied: true,
                    reason: blockReason,
                    at: new Date().toISOString(),
                  }
                : null,
            },
          },
          getDecisionNote(req.body || {}) ||
            (manualOverride
              ? `Manual override applied for paper execution. ${blockReason}`
              : request.decisionNote || null)
        );

        res.status(201).json({
          approval_request: updated,
          pre_trade_analysis: preTradeAnalysis,
          paper_execution: updated.paper_execution,
          manual_override: manualOverride,
          block_reason: manualOverride ? blockReason : null,
        });
      } catch (error) {
        res.status(400).json({
          error: error.message,
          details: error.details,
        });
      }
    },

    async executeBrokerPaper(req, res) {
      try {
        const result = await executeBrokerPaperOrder(
          req.user.id,
          req.params.id,
          {
            confirmSubmit: Boolean(req.body?.confirmSubmit),
            decisionNote: getDecisionNote(req.body || {}) || null,
            manualOverride: Boolean(req.body?.manualOverride ?? req.body?.forceExecute),
          }
        );
        res.status(result?.requiresConfirmation ? 200 : 201).json(result);
      } catch (error) {
        res.status(error.statusCode || 400).json({
          error: error.message,
          block_reason: error.blockReason || null,
          override_eligible: Boolean(error.overrideEligible),
          approval_request: error.approvalRequest || null,
          pre_trade_analysis: error.preTradeAnalysis || null,
          broker_order: error.brokerOrder || null,
          preflight: error.preflight || null,
        });
      }
    },
  };
}

module.exports = { createApprovalsController };
