function link(entityType, entityId, relationshipType = "RELATED_TO") { return entityId ? { entityType, entityId: String(entityId), relationshipType } : null; }
function compact(values) { return values.filter(Boolean); }
function matrixProposalEvent(record, eventType = "MATRIX_PROPOSAL_CREATED") { const proposal = record.proposalJson || {}; const versions = [...new Set((proposal.actions || []).flatMap((action) => [action.currentStrategyVersionId, action.proposedStrategyVersionId]).filter(Boolean))]; return { userId: record.userId, eventType, sourceType: "MATRIX_PROPOSAL", sourceId: record.id, sourceVersion: String(record.updatedAt || record.createdAt || "1"), title: `${record.title} ${eventType === "MATRIX_PROPOSAL_CREATED" ? "created" : eventType === "MATRIX_PROPOSAL_APPROVED" ? "approved" : "rejected"}`, summary: `Matrix proposal ${record.title} was ${eventType === "MATRIX_PROPOSAL_CREATED" ? "created for review" : eventType === "MATRIX_PROPOSAL_APPROVED" ? "approved through the deployment workflow" : "rejected by the user"}.`, structuredData: { proposalType: proposal.proposalType, objective: record.objective, actionCount: proposal.actions?.length || 0, confidence: record.confidence, status: record.status }, confidence: record.confidence, occurredAt: record.updatedAt || record.createdAt, createdByType: eventType === "MATRIX_PROPOSAL_CREATED" ? "AI" : "USER", importanceContext: { stateTransition: eventType !== "MATRIX_PROPOSAL_CREATED", deploymentImpact: eventType === "MATRIX_PROPOSAL_APPROVED" }, links: compact([link("MATRIX", record.deploymentSetId, "DEPLOYED_IN"), ...versions.map((id) => link("STRATEGY_VERSION", id, "DEPLOYED_IN"))]) }; }
function matrixReplayEvent(record) { return { userId: record.userId, eventType: "MATRIX_REPLAY_COMPLETED", sourceType: "MATRIX_REPLAY", sourceId: record.id, title: "Matrix replay completed", summary: `Matrix replay completed for ${(record.symbolsJson || []).length} symbols over ${record.period || "the selected period"}.`, structuredData: { period: record.period, symbolCount: (record.symbolsJson || []).length, totalReturnPct: record.resultJson?.totalReturnPct, sharpe: record.resultJson?.sharpe, maxDrawdownPct: record.resultJson?.maxDrawdownPct, completedTrades: record.resultJson?.completedTrades }, occurredAt: record.createdAt, importanceContext: { measurableOutcome: true }, links: compact([link("MATRIX", record.deploymentSetId, "VALIDATED_BY"), link("MATRIX_REPLAY", record.id, "GENERATED_FROM")]) }; }
function matrixDeployedEvent(record, proposal) { const versions = [...new Set((proposal.proposalJson?.actions || []).flatMap((action) => [action.currentStrategyVersionId, action.proposedStrategyVersionId]).filter(Boolean))]; return { userId: record.userId, eventType: "MATRIX_DEPLOYED", sourceType: "DEPLOYMENT_SET", sourceId: record.id, sourceVersion: String(record.updatedAt), title: `${record.name || "Deployment matrix"} deployed`, summary: `Deployment matrix changes from proposal ${proposal.title} were applied through the canonical Strategy Lab deployment workflow.`, structuredData: { deploymentSetName: record.name, proposalId: proposal.id, proposalTitle: proposal.title, actionCount: proposal.proposalJson?.actions?.length || 0 }, occurredAt: record.updatedAt, createdByType: "USER", importanceContext: { realCapitalImpact: true, stateTransition: true }, links: compact([link("MATRIX", record.id, "DEPLOYED_IN"), ...versions.map((id) => link("STRATEGY_VERSION", id, "DEPLOYED_IN"))]) }; }
function portfolioProposalEvent(record, eventType = "PORTFOLIO_PROPOSAL_CREATED") { return { userId: record.userId, eventType, sourceType: "PORTFOLIO_PROPOSAL", sourceId: record.id, sourceVersion: String(record.createdAt || "1"), title: `${record.title} ${eventType === "PORTFOLIO_PROPOSAL_CREATED" ? "created" : eventType === "PORTFOLIO_PROPOSAL_APPROVED" ? "approved" : "rejected"}`, summary: `Portfolio proposal ${record.title} was ${eventType === "PORTFOLIO_PROPOSAL_CREATED" ? "created for review" : eventType === "PORTFOLIO_PROPOSAL_APPROVED" ? "approved" : "rejected"}. No broker action is implied by this memory.`, structuredData: { objective: record.objective, provider: record.provider, executionMode: record.executionMode, confidence: record.confidence }, confidence: record.confidence, occurredAt: record.createdAt, createdByType: eventType === "PORTFOLIO_PROPOSAL_CREATED" ? "AI" : "USER", importanceContext: { stateTransition: eventType !== "PORTFOLIO_PROPOSAL_CREATED" }, links: [link("PORTFOLIO_PROPOSAL", record.id, eventType.includes("APPROVED") ? "APPROVED_BY" : eventType.includes("REJECTED") ? "REJECTED_BY" : "GENERATED_FROM")] }; }
function researchProjectEvent(record) { return { userId: record.userId, eventType: "RESEARCH_PROJECT_CREATED", sourceType: "RESEARCH_PROJECT", sourceId: record.id, title: `${record.title} research project created`, summary: `Research project ${record.title} was created with ${record.researchType} scope.`, structuredData: { researchType: record.researchType, status: record.status, title: record.title }, occurredAt: record.createdAt, createdByType: "USER", links: [link("RESEARCH_PROJECT", record.id)] }; }
function researchReportEvent(record) { return { userId: record.userId, eventType: "RESEARCH_REPORT_CREATED", sourceType: "RESEARCH_REPORT", sourceId: record.id, sourceVersion: String(record.versionNumber), title: `${record.title} v${record.versionNumber} created`, summary: `Research report ${record.title} version ${record.versionNumber} was created with confidence ${record.confidence ?? "unavailable"}.`, structuredData: { reportType: record.reportType, versionNumber: record.versionNumber, confidence: record.confidence, executiveSummary: String(record.executiveSummary || "").slice(0, 500) }, confidence: record.confidence, occurredAt: record.createdAt, createdByType: "AI", links: compact([link("RESEARCH_PROJECT", record.projectId, "RELATED_TO"), link("RESEARCH_REPORT", record.id, "GENERATED_FROM"), link("AI_INVOCATION", record.aiInvocationId, "GENERATED_FROM")]) }; }
function thesisUpdatedEvent(record) { return { userId: record.userId, eventType: "THESIS_UPDATED", sourceType: "RESEARCH_THESIS", sourceId: record.id, sourceVersion: String(record.versionNumber), title: `Research thesis ${record.status.toLowerCase()}`, summary: `Research thesis version ${record.versionNumber} was recorded as ${record.status} with confidence ${record.confidence ?? "unavailable"}.`, structuredData: { status: record.status, confidence: record.confidence, versionNumber: record.versionNumber, statement: String(record.statement || "").slice(0, 500) }, confidence: record.confidence, occurredAt: record.createdAt, createdByType: "USER", importanceContext: { stateTransition: true }, links: compact([link("RESEARCH_PROJECT", record.projectId)]) }; }
function strategyVersionEvent(record, strategyName = "Strategy") { return { userId: record.userId, eventType: record.deploymentStatus === "ACTIVE" ? "STRATEGY_DEPLOYED" : "STRATEGY_VERSION_CREATED", sourceType: "STRATEGY_VERSION", sourceId: record.id, sourceVersion: String(record.version), title: `${strategyName} v${record.version} ${record.deploymentStatus === "ACTIVE" ? "deployed" : "created"}`, summary: `Strategy ${strategyName} version ${record.version} was ${record.deploymentStatus === "ACTIVE" ? "deployed" : "created"}.`, structuredData: { strategyName, version: record.version, deploymentStatus: record.deploymentStatus, changeNote: record.changeNote }, occurredAt: record.activatedAt || record.createdAt, importanceContext: { stateTransition: true, realCapitalImpact: record.deploymentStatus === "ACTIVE" }, links: compact([link("STRATEGY", record.experimentId), link("STRATEGY_VERSION", record.id, record.deploymentStatus === "ACTIVE" ? "DEPLOYED_IN" : "GENERATED_FROM")]) }; }
function strategyCreatedEvent(record) { return { userId: record.userId, eventType: "STRATEGY_CREATED", sourceType: "STRATEGY_EXPERIMENT", sourceId: record.id, title: `${record.name} created`, summary: `Strategy ${record.name} was created in Strategy Lab as a ${record.status || "DRAFT"} strategy.`, structuredData: { strategyName: record.name, status: record.status }, occurredAt: record.createdAt, createdByType: "USER", links: [link("STRATEGY", record.id, "GENERATED_FROM")] }; }
function strategyDeactivatedEvent(record) { return { userId: record.userId, eventType: "STRATEGY_DEACTIVATED", sourceType: "STRATEGY_VERSION", sourceId: record.id, sourceVersion: String(record.version), title: `${record.strategyName || "Strategy"} v${record.version} deactivated`, summary: `Strategy ${record.strategyName || "Strategy"} version ${record.version} was deactivated from deployment.`, structuredData: { strategyName: record.strategyName, version: record.version, deploymentStatus: "ARCHIVED" }, occurredAt: new Date(), createdByType: "USER", importanceContext: { stateTransition: true, realCapitalImpact: true }, links: compact([link("STRATEGY", record.experimentId), link("STRATEGY_VERSION", record.id, "SUPERSEDES")]) }; }
function backtestEvent(record, strategyName = "Strategy") { return { userId: record.userId, eventType: "BACKTEST_COMPLETED", sourceType: "STRATEGY_RUN", sourceId: record.id, title: `${strategyName} backtest completed`, summary: `Backtest completed for ${strategyName} with ${record.tradeCount ?? 0} trades, Sharpe ${record.sharpe ?? "unavailable"}, and maximum drawdown ${record.maxDrawdown ?? "unavailable"}.`, structuredData: { strategyName, returnPct: record.returnPct, cagr: record.cagr, sharpe: record.sharpe, maxDrawdown: record.maxDrawdown, winRate: record.winRate, tradeCount: record.tradeCount, period: record.period }, occurredAt: record.createdAt, importanceContext: { measurableOutcome: true }, links: compact([link("STRATEGY", record.experimentId), link("STRATEGY_RUN", record.id, "VALIDATED_BY")]) }; }
function walkForwardEvent(record, strategyName = "Strategy") { return { userId: record.userId, eventType: "WALK_FORWARD_COMPLETED", sourceType: "WALK_FORWARD_RUN", sourceId: record.id, title: `${strategyName} walk-forward completed`, summary: `Walk-forward completed for ${strategyName} with out-of-sample Sharpe ${record.oosSharpe ?? "unavailable"}, drawdown ${record.oosDrawdown ?? "unavailable"}, and stability ${record.stabilityScore ?? "unavailable"}.`, structuredData: { strategyName, mode: record.mode, returnPct: record.oosReturn, sharpe: record.oosSharpe, drawdown: record.oosDrawdown, stabilityScore: record.stabilityScore }, occurredAt: record.createdAt, importanceContext: { measurableOutcome: true }, links: compact([link("STRATEGY", record.experimentId, "VALIDATED_BY")]) }; }
function monteCarloEvent(record, strategyName = "Strategy") { return { userId: record.userId, eventType: "MONTE_CARLO_COMPLETED", sourceType: "STRATEGY_STRESS_RESULT", sourceId: record.id, title: `${strategyName} Monte Carlo completed`, summary: `Monte Carlo stress testing completed for ${strategyName} with ${record.simulationCount} simulations, risk of ruin ${record.riskOfRuin ?? "unavailable"}, and worst return ${record.worstReturn ?? "unavailable"}.`, structuredData: { strategyName, simulationCount: record.simulationCount, riskOfRuin: record.riskOfRuin, probability20Drawdown: record.probability20Drawdown, returnPct: record.medianReturn, expectedCagr: record.expectedCagr }, occurredAt: record.createdAt, importanceContext: { measurableOutcome: true }, links: compact([link("STRATEGY", record.experimentId, "VALIDATED_BY")]) }; }
function robustnessEvent(record, strategyName = "Strategy", robustness = {}) { return { userId: record.userId, eventType: "ROBUSTNESS_COMPLETED", sourceType: "STRATEGY_VERSION", sourceId: record.id, sourceVersion: String(record.version), title: `${strategyName} robustness completed`, summary: `Robustness testing completed for ${strategyName} with score ${robustness.score ?? "unavailable"} and deployment readiness ${robustness.deploymentReadiness?.status || robustness.deploymentReadiness || "unavailable"}.`, structuredData: { strategyName, strategyVersion: record.version, robustnessScore: robustness.score, validationStatus: robustness.deploymentReadiness?.status || robustness.deploymentReadiness }, occurredAt: record.createdAt, importanceContext: { measurableOutcome: true }, links: compact([link("STRATEGY", record.experimentId), link("STRATEGY_VERSION", record.id, "VALIDATED_BY")]) }; }
function approvalEvent(record, eventType) { const strategyVersionId = record.raw?.strategyVersionId || record.raw?.active_strategy_config?.strategyVersionId; const opportunityId = record.raw?.opportunityId || record.raw?.opportunity_id; return { userId: record.userId, eventType, sourceType: "APPROVAL", sourceId: record.id, sourceVersion: String(record.updatedAt || record.createdAt), title: `${record.symbol} approval ${eventType.split("_")[1].toLowerCase()}`, summary: `${record.side} approval for ${record.quantity} ${record.symbol} was ${eventType.split("_")[1].toLowerCase()}.`, structuredData: { symbol: record.symbol, side: record.side, quantity: record.quantity, status: record.status, approvalMode: record.approvalMode, opportunityId }, occurredAt: record.decidedAt || record.updatedAt || record.createdAt, createdByType: eventType === "APPROVAL_CREATED" ? "SYSTEM" : "USER", importanceContext: { stateTransition: eventType !== "APPROVAL_CREATED", realCapitalImpact: true }, links: compact([link("APPROVAL", record.id), link("OPPORTUNITY", opportunityId, eventType === "APPROVAL_REJECTED" ? "REJECTED_BY" : "APPROVED_BY"), link("SYMBOL", record.symbol), link("STRATEGY_VERSION", strategyVersionId, "ROUTED_THROUGH")]) }; }
function aiRecommendationEvent(record, sourceType, decision = "CREATED") { const eventType = decision === "ACCEPTED" ? "AI_RECOMMENDATION_ACCEPTED" : decision === "REJECTED" ? "AI_RECOMMENDATION_REJECTED" : "AI_RECOMMENDATION_CREATED"; return { userId: record.userId, eventType, sourceType, sourceId: record.id, sourceVersion: String(record.updatedAt || record.createdAt || "1"), title: `${record.title} AI recommendation ${decision.toLowerCase()}`, summary: `AI recommendation ${record.title} was ${decision.toLowerCase()}${decision === "CREATED" ? " for explicit user review" : " by the user"}.`, structuredData: { title: record.title, objective: record.objective, confidence: record.confidence, decision }, confidence: record.confidence, occurredAt: record.updatedAt || record.createdAt, createdByType: decision === "CREATED" ? "AI" : "USER", importanceContext: { stateTransition: decision !== "CREATED" }, links: compact([link(sourceType === "MATRIX_PROPOSAL" ? "MATRIX" : "PORTFOLIO_PROPOSAL", sourceType === "MATRIX_PROPOSAL" ? record.deploymentSetId : record.id, decision === "ACCEPTED" ? "APPROVED_BY" : decision === "REJECTED" ? "REJECTED_BY" : "GENERATED_FROM")]) }; }
function brokerFillEvent(record) { return { userId: record.userId, eventType: "FILL_RECORDED", sourceType: "BROKER_FILL", sourceId: record.id, title: `${record.symbol} fill recorded`, summary: `${record.side} fill recorded for ${record.quantity} ${record.symbol} at ${record.price}.`, structuredData: { symbol: record.symbol, side: record.side, quantity: record.quantity, price: record.price, commission: record.commission }, occurredAt: record.filledAt || record.createdAt, importanceContext: { realCapitalImpact: true, stateTransition: true, measurableOutcome: true }, links: compact([link("FILL", record.id, "FILLED_BY"), link("ORDER", record.brokerOrderId, "GENERATED_FROM"), link("SYMBOL", record.symbol)]) }; }
function brokerOrderEvent(record) { const submitted = Boolean(record.submittedAt) || !["PENDING_SUBMISSION", "CREATED"].includes(String(record.status || "").toUpperCase()); return { userId: record.userId, eventType: submitted ? "ORDER_SUBMITTED" : "ORDER_CREATED", sourceType: "BROKER_ORDER", sourceId: record.id, title: `${record.symbol} order ${submitted ? "submitted" : "created"}`, summary: `${record.side} order for ${record.quantity} ${record.symbol} was ${submitted ? `submitted to ${record.broker}` : "created for broker submission"} in ${record.mode} mode.`, structuredData: { symbol: record.symbol, side: record.side, quantity: record.quantity, orderType: record.orderType, broker: record.broker, mode: record.mode, status: record.status }, occurredAt: record.submittedAt || record.createdAt, importanceContext: { realCapitalImpact: true, stateTransition: true }, links: compact([link("ORDER", record.id), link("APPROVAL", record.approvalId, "APPROVED_BY"), link("SYMBOL", record.symbol)]) }; }
function scanCompletedEvent(record, details = {}) { return { userId: record.userId, eventType: "SCAN_COMPLETED", sourceType: "SCAN", sourceId: record.id, title: "Scanner run completed", summary: `Scanner run completed with ${details.opportunityCount ?? 0} opportunities and ${details.alertCount ?? 0} alerts.`, structuredData: { source: details.source, opportunityCount: details.opportunityCount, alertCount: details.alertCount, proposalCount: details.proposalCount, approvalCount: details.approvalCount, durationSeconds: details.durationSeconds }, occurredAt: record.generatedAt || record.createdAt, importanceContext: { measurableOutcome: true }, links: compact([link("SCANNER_RUN", record.id, "GENERATED_FROM"), link("STRATEGY_VERSION", record.strategyVersionId, "ROUTED_THROUGH")]) }; }

function portfolioSnapshotEvent(record, details = {}) {
  const state = record.stateJson || {};
  const trigger = details.trigger || "MATERIAL_CHANGE";
  const links = [
    link("PORTFOLIO_SNAPSHOT", record.id, "REFLECTED_IN"),
    link("PORTFOLIO", details.portfolioId || record.userId, "RELATED_TO"),
    link("ORDER", details.orderId, "RESULTED_IN"),
    link("FILL", details.fillId, "RESULTED_IN"),
    link("TRADE", details.tradeId, "RESULTED_IN"),
    link("APPROVAL", details.approvalId, "APPROVED_BY"),
    link("STRATEGY_VERSION", details.strategyVersionId, "ATTRIBUTED_TO"),
    link("MATRIX_CELL", details.matrixCellId, "ROUTED_THROUGH"),
  ];
  return {
    userId: record.userId,
    eventType: "PORTFOLIO_SNAPSHOT_RECORDED",
    sourceType: "PORTFOLIO_SNAPSHOT",
    sourceId: record.id,
    sourceVersion: String(record.updatedAt || record.createdAt || "1"),
    title: "Portfolio snapshot recorded",
    summary: `Portfolio state was materialized with equity ${record.equity ?? state.equity ?? "unavailable"} and cash ${record.cash ?? state.cash ?? "unavailable"} after ${trigger.toLowerCase().replaceAll("_", " ")}.`,
    structuredData: {
      provider: details.provider || state.provider || "INTERNAL_PAPER",
      executionMode: details.executionMode || state.execution_mode || "INTERNAL_PAPER",
      portfolioValue: record.equity ?? state.equity,
      cash: record.cash ?? state.cash,
      buyingPower: state.buying_power,
      realizedPnl: state.realized_pnl,
      unrealizedPnl: state.unrealized_pnl,
      grossExposurePct: state.exposure_pct,
      positionCount: Object.keys(state.positions || {}).length,
      riskLimitState: state.risk_limit_state,
      drawdownPct: state.drawdown_pct,
      trigger,
      snapshotTimestamp: record.createdAt || state.generated_at,
      sourceFreshness: details.sourceFreshness || state.generated_at,
      observedAfter: details.observedAfter || null,
      observationWindow: details.observationWindow || "IMMEDIATE_POST_MATERIALIZATION",
    },
    occurredAt: record.createdAt || new Date(),
    importanceContext: { measurableOutcome: true, realCapitalImpact: Boolean(details.fillId || details.tradeId) },
    links: compact(links),
  };
}

function portfolioOutcomeEvent(record, details = {}) {
  const before = details.beforeState || {};
  const after = record.stateJson || details.afterState || {};
  const metric = (key) => ({ before: before[key] ?? null, after: after[key] ?? null, delta: Number.isFinite(Number(after[key])) && Number.isFinite(Number(before[key])) ? Number(after[key]) - Number(before[key]) : null });
  return {
    userId: record.userId, eventType: "PORTFOLIO_OUTCOME_RECORDED", sourceType: "PORTFOLIO_SNAPSHOT", sourceId: record.id,
    sourceVersion: String(record.updatedAt || record.createdAt || "1"),
    dedupeKey: `portfolio-outcome:${record.id}:${details.observedAfter || "materialization"}`,
    title: "Portfolio outcome observed",
    summary: `Portfolio metrics were observed after ${String(details.observedAfter || "a material state transition").replaceAll("_", " ")}; this is an association, not a causal claim.`,
    structuredData: { observedAfter: details.observedAfter, associatedDecisionId: details.associatedDecisionId, observationWindow: details.observationWindow || "IMMEDIATE_POST_FILL", outcomeStatus: details.outcomeStatus || "OBSERVED", beforeMetrics: { equity: before.equity, cash: before.cash, realizedPnl: before.realized_pnl, unrealizedPnl: before.unrealized_pnl, exposurePct: before.exposure_pct }, afterMetrics: { equity: after.equity, cash: after.cash, realizedPnl: after.realized_pnl, unrealizedPnl: after.unrealized_pnl, exposurePct: after.exposure_pct }, metricDeltas: { equity: metric("equity").delta, cash: metric("cash").delta, realizedPnl: metric("realized_pnl").delta, unrealizedPnl: metric("unrealized_pnl").delta, exposurePct: metric("exposure_pct").delta } },
    occurredAt: record.createdAt || new Date(), importanceContext: { measurableOutcome: true, realCapitalImpact: true },
    links: compact([link("PORTFOLIO_SNAPSHOT", record.id, "REFLECTED_IN"), link("ORDER", details.orderId, "OBSERVED_AFTER"), link("FILL", details.fillId, "OBSERVED_AFTER"), ...(details.fillIds || []).map((id) => link("FILL", id, "OBSERVED_AFTER")), link("TRADE", details.tradeId, "OBSERVED_AFTER"), link("APPROVAL", details.approvalId, "RELATED_TO")]),
  };
}

function portfolioAllocationChangedEvent(record, details = {}) {
  return {
    userId: record.userId, eventType: "PORTFOLIO_ALLOCATION_CHANGED", sourceType: "PORTFOLIO_SNAPSHOT", sourceId: record.id,
    sourceVersion: String(record.updatedAt || record.createdAt || "1"),
    dedupeKey: `portfolio-allocation:${record.id}:${details.symbol || "portfolio"}`,
    title: `${details.symbol || "Portfolio"} allocation changed`,
    summary: `${details.symbol || "Portfolio"} position quantity changed from ${details.beforeQuantity ?? "unavailable"} to ${details.afterQuantity ?? "unavailable"}.`,
    structuredData: { symbol: details.symbol, beforeValue: details.beforeQuantity, afterValue: details.afterQuantity, delta: Number(details.afterQuantity || 0) - Number(details.beforeQuantity || 0), proposalId: details.proposalId, approvalId: details.approvalId, actor: details.actor || "SYSTEM", observedAfter: details.observedAfter },
    occurredAt: record.createdAt || new Date(), importanceContext: { stateTransition: true, realCapitalImpact: true },
    links: compact([link("PORTFOLIO_SNAPSHOT", record.id, "REFLECTED_IN"), link("SYMBOL", details.symbol), link("ORDER", details.orderId, "RESULTED_IN"), link("FILL", details.fillId, "RESULTED_IN"), ...(details.fillIds || []).map((id) => link("FILL", id, "RESULTED_IN")), link("APPROVAL", details.approvalId, "APPROVED_BY")]),
  };
}

function internalPaperExecutionEvents(record, details = {}) {
  const symbol = String(record.symbol || "").toUpperCase();
  const beforeQuantity = Number(details.beforeQuantity || 0);
  const afterQuantity = Number(details.afterQuantity || 0);
  const delta = afterQuantity - beforeQuantity;
  const commonLinks = compact([
    link("FILL", record.id, "FILLED_BY"),
    link("TRADE", record.id, "EXECUTED_BY"),
    link("POSITION", symbol, "RESULTED_IN"),
    link("SYMBOL", symbol),
    link("APPROVAL", record.approvalRequestId, "APPROVED_BY"),
    link("PORTFOLIO_SNAPSHOT", details.snapshotId, "REFLECTED_IN"),
    link("STRATEGY_VERSION", details.strategyVersionId, "ATTRIBUTED_TO"),
    link("MATRIX_CELL", details.matrixCellId, "ROUTED_THROUGH"),
  ]);
  const base = {
    userId: record.userId,
    sourceType: "PAPER_TRADE",
    sourceId: record.id,
    sourceVersion: String(record.createdAt || record.filledAt || "1"),
    structuredData: {
      symbol,
      side: record.side,
      quantity: record.quantity,
      fillPrice: record.fillPrice,
      fees: record.fee,
      beforeQuantity,
      afterQuantity,
      approvalId: record.approvalRequestId,
      strategyVersionId: details.strategyVersionId,
      matrixCellId: details.matrixCellId,
      realizedPnlDelta: details.realizedPnlDelta,
      observedAfter: details.observedAfter || "INTERNAL_PAPER_FILL",
    },
    occurredAt: record.filledAt || record.createdAt,
    importanceContext: { realCapitalImpact: true, stateTransition: true, measurableOutcome: true },
    links: commonLinks,
  };
  const events = [{ ...base, eventType: "INTERNAL_PAPER_FILL_RECORDED", title: `${symbol} internal paper fill recorded`, summary: `${record.side} fill for ${record.quantity} ${symbol} was recorded at ${record.fillPrice}.` }];
  const opened = beforeQuantity === 0 && afterQuantity !== 0;
  const closed = beforeQuantity !== 0 && afterQuantity === 0;
  const reduced = !closed && beforeQuantity !== 0 && Math.abs(afterQuantity) < Math.abs(beforeQuantity);
  const increased = !opened && delta !== 0 && Math.abs(afterQuantity) > Math.abs(beforeQuantity);
  if (opened) events.push({ ...base, eventType: "TRADE_OPENED", dedupeKey: `paper:${record.id}:trade-opened`, title: `${symbol} paper trade opened`, summary: `The ${symbol} internal paper position opened at ${record.fillPrice}.` });
  if (closed) events.push({ ...base, eventType: "TRADE_CLOSED", dedupeKey: `paper:${record.id}:trade-closed`, title: `${symbol} paper trade closed`, summary: `The ${symbol} internal paper position closed at ${record.fillPrice}.` });
  if (increased || opened) events.push({ ...base, eventType: "POSITION_INCREASED", dedupeKey: `paper:${record.id}:position-increased`, title: `${symbol} position increased`, summary: `${symbol} position changed from ${beforeQuantity} to ${afterQuantity}.` });
  if (reduced) {
    events.push({ ...base, eventType: "TRADE_PARTIALLY_CLOSED", dedupeKey: `paper:${record.id}:trade-partially-closed`, title: `${symbol} paper trade partially closed`, summary: `The ${symbol} internal paper position was reduced from ${beforeQuantity} to ${afterQuantity}.` });
    events.push({ ...base, eventType: "POSITION_REDUCED", dedupeKey: `paper:${record.id}:position-reduced`, title: `${symbol} position reduced`, summary: `${symbol} position changed from ${beforeQuantity} to ${afterQuantity}.` });
  }
  if (closed) {
    events.push({ ...base, eventType: "POSITION_CLOSED", dedupeKey: `paper:${record.id}:position-closed`, title: `${symbol} position closed`, summary: `${symbol} position changed from ${beforeQuantity} to zero.` });
    events.push({ ...base, eventType: "TRADE_OUTCOME_RECORDED", dedupeKey: `paper:${record.id}:outcome`, title: `${symbol} paper trade outcome recorded`, summary: `The ${symbol} paper trade closed with realized P&L change ${details.realizedPnlDelta ?? "unavailable"}.` });
  }
  return events;
}

const BROKER_STATUS_EVENTS = Object.freeze({
  ACKNOWLEDGED: "ORDER_ACKNOWLEDGED", SUBMITTED: "ORDER_ACKNOWLEDGED", PARTIALLY_FILLED: "ORDER_PARTIALLY_FILLED", FILLED: "ORDER_FILLED", CANCELLED: "ORDER_CANCELLED", CANCELED: "ORDER_CANCELLED", REJECTED: "ORDER_REJECTED", EXPIRED: "ORDER_EXPIRED", SUBMIT_FAILED: "ORDER_SUBMIT_FAILED",
});
function brokerOrderTransitionEvent(record, previousStatus = null) {
  const status = String(record.status || "").toUpperCase();
  const eventType = BROKER_STATUS_EVENTS[status] || "ORDER_MODIFIED";
  return {
    userId: record.userId, eventType, sourceType: "BROKER_ORDER", sourceId: record.id,
    sourceVersion: String(record.lastUpdatedAt || record.updatedAt || status),
    dedupeKey: `broker-order:${record.id}:${status}:${record.filledQuantity ?? 0}`,
    title: `${record.symbol} order ${status.toLowerCase().replaceAll("_", " ")}`,
    summary: `${record.broker} ${record.mode} order for ${record.symbol} changed from ${previousStatus || "unknown"} to ${status}.`,
    structuredData: { symbol: record.symbol, side: record.side, quantity: record.quantity, filledQuantity: record.filledQuantity, remainingQuantity: record.remainingQuantity, broker: record.broker, mode: record.mode, previousStatus, status },
    occurredAt: record.lastUpdatedAt || record.updatedAt || new Date(),
    importanceContext: { realCapitalImpact: true, stateTransition: true },
    links: compact([link("ORDER", record.id), link("APPROVAL", record.approvalId, "APPROVED_BY"), link("SYMBOL", record.symbol)]),
  };
}

function opportunityEvent(record, eventType = "OPPORTUNITY_IDENTIFIED", details = {}) {
  const rawConfidence = Number(record.finalConfidence ?? record.confidence);
  const confidence = Number.isFinite(rawConfidence) ? (rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence) : null;
  return {
    userId: record.userId, eventType, sourceType: "OPPORTUNITY", sourceId: record.id,
    sourceVersion: String(record.createdAt || "1"),
    dedupeKey: `opportunity:${record.id}:${eventType}`,
    title: `${record.symbol} opportunity ${eventType.replace("OPPORTUNITY_", "").replace("SIGNAL_", "").toLowerCase().replaceAll("_", " ")}`,
    summary: `${record.symbol} scanner opportunity was recorded as ${eventType.toLowerCase().replaceAll("_", " ")} with score ${record.opportunityScore ?? "unavailable"}.`,
    structuredData: { symbol: record.symbol, score: record.opportunityScore, confidence: record.finalConfidence ?? record.confidence, originalSignal: record.signal, resultingSignal: details.resultingSignal || record.signal, reason: details.reason, regime: record.regimeAtSignal || record.marketRegime, sector: record.sectorContext || record.sector },
    confidence,
    occurredAt: record.createdAt,
    importanceContext: { stateTransition: eventType !== "OPPORTUNITY_IDENTIFIED" },
    links: compact([link("OPPORTUNITY", record.id), link("SCANNER_RUN", record.scanId, "GENERATED_FROM"), link("STRATEGY_VERSION", record.strategyVersionId, "ROUTED_THROUGH"), link("SYMBOL", record.symbol), link("SECTOR", record.sectorContext || record.sector), link("REGIME", record.regimeAtSignal || record.marketRegime)]),
  };
}

function strategyEditDecisionEvent(record, eventType, details = {}) {
  const accepted = eventType === "STRATEGY_EDIT_APPROVED";
  return {
    userId: record.userId, eventType, sourceType: accepted ? "STRATEGY_VERSION" : "STRATEGY_EXPERIMENT", sourceId: record.id,
    sourceVersion: String(record.version || record.updatedAt || record.createdAt || "1"),
    dedupeKey: `strategy-edit:${record.id}:${eventType}:${details.contractHash || record.version || "1"}`,
    title: `${details.strategyName || record.strategyName || "Strategy"} edit ${accepted ? "approved" : eventType === "STRATEGY_EDIT_REJECTED" ? "rejected" : "proposed"}`,
    summary: `${details.summary || "AI-assisted strategy edit"} was ${accepted ? "approved and saved as an immutable version" : eventType === "STRATEGY_EDIT_REJECTED" ? "rejected by the user" : "proposed for user review"}.`,
    structuredData: { reason: details.reason, summary: details.summary, contractHash: details.contractHash, parentVersionId: details.parentVersionId, resultingVersion: record.version, diffSummary: details.diffSummary },
    occurredAt: record.createdAt || record.updatedAt || new Date(), createdByType: accepted || eventType === "STRATEGY_EDIT_REJECTED" ? "USER" : "AI",
    importanceContext: { stateTransition: accepted || eventType === "STRATEGY_EDIT_REJECTED" },
    links: compact([link("STRATEGY", record.experimentId || record.id), link("STRATEGY_VERSION", accepted ? record.id : details.parentVersionId, accepted ? "RESULTED_IN" : "GENERATED_FROM"), link("AI_INVOCATION", details.aiInvocationId, "GENERATED_FROM")]),
  };
}

function strategyValidationEvent(record, passed, details = {}) {
  const eventType = passed ? "STRATEGY_VALIDATION_PASSED" : (details.deploymentBlocked ? "STRATEGY_DEPLOYMENT_BLOCKED" : "STRATEGY_VALIDATION_FAILED");
  return {
    userId: record.userId, eventType, sourceType: "STRATEGY_VERSION", sourceId: record.id, sourceVersion: String(record.version),
    dedupeKey: `strategy-validation:${record.id}:${eventType}:${details.stage || "DEPLOYMENT_READINESS"}`,
    title: `${details.strategyName || "Strategy"} v${record.version} ${passed ? "validation passed" : "validation failed"}`,
    summary: `${details.strategyName || "Strategy"} version ${record.version} ${passed ? "passed" : "failed"} ${details.stage || "deployment readiness"} validation.`,
    structuredData: { strategyName: details.strategyName, version: record.version, validationStage: details.stage || "DEPLOYMENT_READINESS", passed, failureCodes: (details.failureCodes || []).slice(0, 20), lifecycleImpact: details.deploymentBlocked ? "DEPLOYMENT_BLOCKED" : passed ? "ELIGIBLE_FOR_DEPLOYMENT" : "VALIDATION_FAILED", readinessScore: details.readinessScore },
    occurredAt: details.occurredAt || new Date(), importanceContext: { stateTransition: true },
    links: compact([link("STRATEGY", record.experimentId), link("STRATEGY_VERSION", record.id, "VALIDATED_BY")]),
  };
}

function strategyRollbackEvent(restored, previous, details = {}) {
  return {
    userId: restored.userId, eventType: "STRATEGY_ROLLED_BACK", sourceType: "STRATEGY_VERSION", sourceId: restored.id, sourceVersion: String(restored.version),
    dedupeKey: `strategy-rollback:${previous?.id || "unknown"}:${restored.id}:${details.deploymentSetId || "primary"}`,
    title: `${details.strategyName || "Strategy"} rolled back to v${restored.version}`,
    summary: `${details.strategyName || "Strategy"} deployment was rolled back from version ${previous?.version ?? "unknown"} to version ${restored.version}.`,
    structuredData: { strategyName: details.strategyName, rolledBackVersionId: previous?.id, rolledBackVersion: previous?.version, restoredVersionId: restored.id, restoredVersion: restored.version, reason: details.reason, deploymentSetId: details.deploymentSetId },
    occurredAt: details.occurredAt || new Date(), createdByType: "USER", importanceContext: { stateTransition: true, realCapitalImpact: true },
    links: compact([link("STRATEGY", restored.experimentId), link("STRATEGY_VERSION", previous?.id, "SUPERSEDES"), link("STRATEGY_VERSION", restored.id, "RESULTED_IN"), link("MATRIX", details.deploymentSetId, "DEPLOYED_IN")]),
  };
}

module.exports = { aiRecommendationEvent, approvalEvent, backtestEvent, brokerFillEvent, brokerOrderEvent, brokerOrderTransitionEvent, internalPaperExecutionEvents, matrixDeployedEvent, matrixProposalEvent, matrixReplayEvent, monteCarloEvent, opportunityEvent, portfolioAllocationChangedEvent, portfolioOutcomeEvent, portfolioProposalEvent, portfolioSnapshotEvent, researchProjectEvent, researchReportEvent, robustnessEvent, scanCompletedEvent, strategyCreatedEvent, strategyDeactivatedEvent, strategyEditDecisionEvent, strategyRollbackEvent, strategyValidationEvent, strategyVersionEvent, thesisUpdatedEvent, walkForwardEvent };
