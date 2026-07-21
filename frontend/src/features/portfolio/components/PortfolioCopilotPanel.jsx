import { useState } from "react";
import { API_BASE_URL, apiFetch } from "../../../services/apiClient";
import HistoricalContextUsed from "../../../components/common/HistoricalContextUsed";
import { formatNumber, formatNumericValue } from "../../../utils/numberFormat";

export const PORTFOLIO_COPILOT_QUESTIONS = [
  "Explain my portfolio.",
  "What is my biggest risk?",
  "Why is my portfolio down today?",
  "Am I overexposed to one sector?",
  "Which holdings contributed most to performance?",
  "How much capital is controlled by each strategy?",
];

const ADVISOR_QUESTIONS = [
  "Reduce my biggest concentration risk.",
  "Show me a lower-risk allocation.",
  "What happens if I hold 20% cash?",
  "Cap Technology exposure at 25%.",
  "Compare my current portfolio with equal weighting.",
  "Reduce reliance on my weakest strategy.",
];

function formatTimestamp(value) {
  if (!value) return "Timestamp unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Timestamp unavailable" : parsed.toLocaleString();
}

function EvidenceCards({ evidence = [] }) {
  if (!evidence.length) return <p className="portfolio-copilot-empty">Insufficient evidence available.</p>;
  return (
    <div className="portfolio-copilot-evidence">
      {evidence.map((item) => (
        <article key={`${item.sourceType}-${item.sourceId}-${item.metricName}`}>
          <div><span>{item.sourceType.replaceAll("_", " ")}</span><em>{item.strength}</em></div>
          <strong>{item.symbol || item.strategy || item.metricName}</strong>
          <p>{item.symbol || item.strategy ? `${item.metricName}: ` : ""}{formatNumericValue(item.metricValue)}</p>
          <small>{item.interpretation}</small>
        </article>
      ))}
    </div>
  );
}

function ActionList({ actions = [] }) {
  return <ul>{actions.map((action, index) => <li key={`${action.actionType}-${action.symbol}-${action.strategyId}-${index}`}><strong>{action.actionType.replaceAll("_", " ")}</strong>{action.symbol ? ` ${action.symbol}` : ""}{action.sector ? ` ${action.sector}` : ""}: {formatNumericValue(action.currentValue)} → {formatNumericValue(action.proposedValue)} {action.unit === "PERCENT" ? "%" : action.unit}</li>)}</ul>;
}

function AllocationBars({ title, items = [], valueKey, labelKey }) {
  return <section className="portfolio-copilot-allocation"><h4>{title}</h4>{items.slice(0, 8).map((item) => <div key={item[labelKey]}><span>{item[labelKey]}</span><div><i style={{ width: `${Math.min(100, Math.max(0, Number(item[valueKey]) || 0))}%` }} /></div><strong>{formatNumber(item[valueKey] || 0)}%</strong></div>)}</section>;
}

function ScenarioComparison({ comparison }) {
  const metrics = [
    ["Cash", comparison.current.cashPct, comparison.proposed.cashPct],
    ["Largest position", comparison.current.largestPositionPct, comparison.proposed.largestPositionPct],
    ["Largest sector", comparison.current.largestSectorPct, comparison.proposed.largestSectorPct],
    ["Diversification", comparison.current.diversificationScore, comparison.proposed.diversificationScore],
  ];
  return <>
    <div className="portfolio-copilot-simulation-labels"><span>Advisory Only</span><span>No changes applied</span><span>{comparison.method.replaceAll("_", " ")}</span></div>
    <section><h4>Current vs Proposed</h4><div className="portfolio-copilot-comparison">{metrics.map(([label, before, after]) => <article key={label}><span>{label}</span><div><small>Current</small><strong>{before == null ? "Unavailable" : `${formatNumber(before)}%`}</strong></div><b>→</b><div><small>Proposed</small><strong>{after == null ? "Unavailable" : `${formatNumber(after)}%`}</strong></div></article>)}</div></section>
    <div className="portfolio-copilot-columns">
      <AllocationBars title="Current Allocation" items={comparison.current.positions} valueKey="weightPct" labelKey="symbol" />
      <AllocationBars title="Proposed Allocation" items={comparison.proposed.positions} valueKey="weightPct" labelKey="symbol" />
    </div>
    {comparison.current.strategyAllocations?.length > 0 && <div className="portfolio-copilot-columns"><AllocationBars title="Current Strategy Allocation" items={comparison.current.strategyAllocations} valueKey="assignedCapitalPct" labelKey="strategyName" /><AllocationBars title="Proposed Strategy Allocation" items={comparison.proposed.strategyAllocations} valueKey="assignedCapitalPct" labelKey="strategyName" /></div>}
    {comparison.current.matrixAllocations?.length > 0 && <div className="portfolio-copilot-columns"><AllocationBars title="Current Matrix Allocation" items={comparison.current.matrixAllocations.map((item) => ({ ...item, cellLabel: `${item.sector} / ${item.regime}` }))} valueKey="allocationPct" labelKey="cellLabel" /><AllocationBars title="Proposed Matrix Allocation" items={comparison.proposed.matrixAllocations.map((item) => ({ ...item, cellLabel: `${item.sector} / ${item.regime}` }))} valueKey="allocationPct" labelKey="cellLabel" /></div>}
    {comparison.historicalSimulation?.current?.metrics && <section><h4>Historical Strategy Simulation</h4><div className="portfolio-copilot-comparison">{Object.keys(comparison.historicalSimulation.proposed.metrics).map((metric) => <article key={metric}><span>{metric}</span><div><small>Current</small><strong>{formatNumericValue(comparison.historicalSimulation.current.metrics[metric] ?? "Unavailable")}</strong></div><b>→</b><div><small>Proposed</small><strong>{formatNumericValue(comparison.historicalSimulation.proposed.metrics[metric] ?? "Unavailable")}</strong></div></article>)}</div></section>}
    <section><h4>Simulation Costs</h4><p>{formatNumber(comparison.turnoverPct)}% estimated turnover · ${formatNumber(comparison.transactionCosts.estimatedTotal)} estimated costs · {formatNumber(comparison.transactionCosts.affectedTrades)} affected positions</p></section>
  </>;
}

function ResponseCard({ item, onApprove, onDiscard, onEdit, onSave, onSimulateProposal }) {
  const response = item.response;
  const isRecommendation = Array.isArray(response.recommendations);
  const isScenario = Boolean(item.comparison);
  const limitations = response.dataLimitations || response.dataModelLimitations || [];
  const nextPrompt = response.suggestedNextQuestion || response.availableUserActions?.[0] || "Review the evidence and try another question.";
  return (
    <article className="portfolio-copilot-response">
      <header>
        <div>
          <span>{item.provider.replaceAll("_", " ")}</span>
          <h3>{item.question}</h3>
        </div>
        <strong>{formatNumber(response.confidenceScore)}/100 confidence</strong>
      </header>
      {item.freshness?.stale && <p className="portfolio-copilot-warning">Data freshness warning: values may not reflect the latest market or broker state.</p>}
      {item.advisoryOnly && !isScenario && <div className="portfolio-copilot-simulation-labels"><span>Advisory Only</span><span>No changes applied</span></div>}
      <section><h4>Summary</h4><p>{response.summary}</p></section>
      {response.portfolioConcernOrObjective && <section><h4>Portfolio Concern or Objective</h4><p>{response.portfolioConcernOrObjective}</p></section>}
      {response.recommendation && <section><h4>Recommendation</h4><p>{response.recommendation}</p></section>}
      {!isRecommendation && !isScenario && <div className="portfolio-copilot-columns">
        <section>
          <h4>Key Findings</h4>
          {response.keyFindings.length ? <ul>{response.keyFindings.map((finding) => <li key={finding}>{finding}</li>)}</ul> : <p>No supported findings.</p>}
        </section>
        <section>
          <h4>Reasoning</h4>
          {response.reasoning.length ? <ul>{response.reasoning.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>No additional reasoning.</p>}
        </section>
      </div>}
      {isRecommendation && <section><h4>Ranked Recommendations</h4><div className="portfolio-copilot-recommendations">{response.recommendations.map((proposal, index) => <article key={proposal.title}><span>Option {String.fromCharCode(65 + index)}</span><h3>{proposal.title}</h3><p>{proposal.objective}</p><ActionList actions={proposal.actions} /><p><strong>Expected benefit:</strong> {proposal.expectedBenefit}</p><p><strong>Trade-off:</strong> {proposal.potentialDownside}</p><footer>{formatNumber(proposal.confidence)}/100 confidence · {proposal.simulationAvailable ? "Simulation available" : "Simulation unavailable"}</footer>{proposal.simulationAvailable && <button onClick={() => onSimulateProposal(proposal)} type="button">Simulate this option</button>}</article>)}</div></section>}
      {isScenario && <><section><h4>Proposed Actions</h4><ActionList actions={item.proposal.actions} /></section><ScenarioComparison comparison={item.comparison} /><div className="portfolio-copilot-columns"><section><h4>Expected Benefits</h4><ul>{(response.expectedBenefits || []).map((benefit) => <li key={benefit}>{benefit}</li>)}</ul></section><section><h4>Risks and Trade-offs</h4><ul>{(response.risksTradeoffs || []).map((risk) => <li key={risk}>{risk}</li>)}</ul></section></div></>}
      <section><h4>Evidence</h4><EvidenceCards evidence={response.evidence} /></section>
      <HistoricalContextUsed context={response.historicalContextUsed} />
      <div className="portfolio-copilot-footer-grid">
        <section><h4>Data Limitations</h4><ul>{limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>
        <section><h4>Available User Action</h4><p>{nextPrompt}</p></section>
      </div>
      <footer>
        Snapshot {formatTimestamp(item.freshness?.portfolioSnapshotTimestamp)} · Reconciliation {item.freshness?.reconciliationState || "UNAVAILABLE"}
      </footer>
      {isScenario && <div className="portfolio-copilot-proposal-actions">
        {!item.savedProposal && <button onClick={() => onSave(item)} type="button">Save Proposal</button>}
        {item.savedProposal?.approvalStatus === "PENDING" && <button onClick={() => onApprove(item)} type="button">Approve Proposal</button>}
        <button onClick={() => onEdit(item)} type="button">Edit</button>
        <button className="danger" onClick={() => onDiscard(item)} type="button">Discard</button>
        <span>{item.savedProposal ? `Saved · ${item.savedProposal.approvalStatus}` : "Unsaved draft"}</span>
      </div>}
    </article>
  );
}

export default function PortfolioCopilotPanel() {
  const [mode, setMode] = useState("proposal");
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [editingParentId, setEditingParentId] = useState(null);
  const [proposalHistory, setProposalHistory] = useState([]);
  const [preferences, setPreferences] = useState({ targetRisk: "", targetVolatility: "", targetCash: "", targetDrawdown: "", targetSharpe: "", allowedTurnoverPct: "", maximumTransactionCost: "", preferredStrategy: "", preferredMatrix: "" });

  async function run(path, submittedQuestion, proposal = null) {
    const trimmed = String(submittedQuestion || "").trim();
    if (!trimmed) {
      setError("Enter a portfolio question before asking Copilot.");
      return;
    }
    if (advancedMode && (path.endsWith("/proposal") || path.endsWith("/scenario"))) {
      const percentKeys = ["targetVolatility", "targetCash", "targetDrawdown", "allowedTurnoverPct"];
      const invalidPercent = percentKeys.find((key) => preferences[key] !== "" && (!Number.isFinite(Number(preferences[key])) || Number(preferences[key]) < 0 || Number(preferences[key]) > 100));
      if (invalidPercent || (preferences.maximumTransactionCost !== "" && Number(preferences.maximumTransactionCost) < 0) || (preferences.targetSharpe !== "" && (Number(preferences.targetSharpe) < 0 || Number(preferences.targetSharpe) > 10))) {
        setError("Advanced numeric targets must be within their supported bounds.");
        return;
      }
    }
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(path.endsWith("/overview") ? {} : { question: trimmed, ...(proposal ? { proposal } : {}), ...((path.endsWith("/proposal") || path.endsWith("/scenario")) && advancedMode ? { preferences: Object.fromEntries(Object.entries(preferences).filter(([, value]) => value !== "")) } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Portfolio Copilot request failed.");
      setHistory((current) => [{ ...payload, question: trimmed, ...(editingParentId ? { parentProposalId: editingParentId } : {}) }, ...current]);
      setEditingParentId(null);
      setQuestion("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function proposalAction(path, body = {}) {
    setLoading(true); setError("");
    try {
      const response = await apiFetch(`${API_BASE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Portfolio proposal action failed.");
      return payload;
    } catch (actionError) { setError(actionError.message); return null; }
    finally { setLoading(false); }
  }

  const updateHistoryItem = (target, updater) => setHistory((items) => items.map((item) => item.generatedAt === target.generatedAt ? updater(item) : item));
  const saveProposal = async (item) => {
    const saved = await proposalAction("/api/portfolio/copilot/proposals", { proposal: item.proposal, explanation: item.response, evidence: item.response.evidence, confidence: item.response.confidenceScore, sourcePrompt: item.question, parentProposalId: item.parentProposalId || null });
    if (saved) updateHistoryItem(item, (current) => ({ ...current, savedProposal: saved }));
  };
  const approveProposal = async (item) => {
    const approved = await proposalAction(`/api/portfolio/copilot/proposals/${item.savedProposal.id}/approve`);
    if (approved) updateHistoryItem(item, (current) => ({ ...current, savedProposal: approved }));
  };
  const loadProposalHistory = async () => {
    setLoading(true); setError("");
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/portfolio/copilot/proposals`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load proposal history.");
      setProposalHistory(payload.proposals || []);
    } catch (historyError) { setError(historyError.message); }
    finally { setLoading(false); }
  };

  const modePath = mode === "proposal" ? "/api/portfolio/copilot/proposal" : mode === "recommend" ? "/api/portfolio/copilot/recommend" : mode === "simulate" ? "/api/portfolio/copilot/scenario" : "/api/portfolio/copilot/ask";
  const suggestions = mode === "analyze" ? PORTFOLIO_COPILOT_QUESTIONS : ADVISOR_QUESTIONS;
  const submitLabel = loading ? "Working..." : mode === "proposal" ? "Generate Proposal" : mode === "recommend" ? "Generate Recommendations" : mode === "simulate" ? "Run What-If" : "Ask Copilot";

  return (
    <section className="portfolio-copilot-panel" aria-labelledby="portfolio-copilot-title">
      <div className="portfolio-copilot-heading">
        <div><p className="eyebrow">Portfolio Copilot</p><h2 id="portfolio-copilot-title">Portfolio intelligence, grounded in your account</h2></div>
        <button disabled={loading} onClick={() => run("/api/portfolio/copilot/overview", "Explain my portfolio.")} type="button">
          {loading ? "Analyzing..." : "Generate Overview"}
        </button>
      </div>
      <p className="portfolio-copilot-readonly">Read-only analysis. Copilot cannot place orders, change allocations, or refresh broker data.</p>
      <div className="portfolio-copilot-modes" aria-label="Portfolio Copilot mode">
        {[['proposal', 'Proposal'], ['analyze', 'Analyze'], ['recommend', 'Recommend'], ['simulate', 'Simulate']].map(([value, label]) => <button aria-pressed={mode === value} key={value} onClick={() => setMode(value)} type="button">{label}</button>)}
      </div>
      <button className="portfolio-copilot-history-button" disabled={loading} onClick={loadProposalHistory} type="button">Proposal History</button>
      {mode === "proposal" && <div className="portfolio-copilot-advanced">
        <button aria-controls="portfolio-proposal-advanced-fields" aria-expanded={advancedMode} onClick={() => setAdvancedMode((value) => !value)} type="button">Advanced Mode {advancedMode ? "▴" : "▾"}</button>
        {advancedMode && <div id="portfolio-proposal-advanced-fields">
          {[['targetRisk', 'Target Risk'], ['targetVolatility', 'Target Volatility'], ['targetCash', 'Target Cash %'], ['targetDrawdown', 'Target Drawdown %'], ['targetSharpe', 'Target Sharpe'], ['allowedTurnoverPct', 'Allowed Turnover %'], ['maximumTransactionCost', 'Maximum Transaction Cost'], ['preferredStrategy', 'Preferred Strategy'], ['preferredMatrix', 'Preferred Matrix']].map(([key, label]) => <label key={key}>{label}<input inputMode={key.startsWith('preferred') || key === 'targetRisk' ? 'text' : 'decimal'} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.value }))} value={preferences[key]} /></label>)}
        </div>}
      </div>}
      <div className="portfolio-copilot-ask">
        <label htmlFor="portfolio-copilot-question">{mode === "analyze" ? "Ask about composition, performance, exposure, risk, orders, or strategies" : "Ask what you want to improve or simulate"}</label>
        <div>
          <input
            id="portfolio-copilot-question"
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") run(modePath, question); }}
            placeholder={mode === "simulate" ? "What happens if I hold 20% cash?" : "Which positions contribute the most risk?"}
            value={question}
          />
          <button disabled={loading} onClick={() => run(modePath, question)} type="button">{submitLabel}</button>
        </div>
      </div>
      <div className="portfolio-copilot-suggestions" aria-label="Suggested portfolio questions">
        {suggestions.map((suggestion) => (
          <button aria-pressed={question === suggestion} disabled={loading} key={suggestion} onClick={() => setQuestion(suggestion)} type="button">{suggestion}</button>
        ))}
      </div>
      <div aria-live="polite">
        {error && <p className="engine-error">{error}</p>}
        {loading && <p className="portfolio-copilot-status">Resolving the selected provider and grounding the response...</p>}
      </div>
      {proposalHistory.length > 0 && <section className="portfolio-copilot-saved-history"><h3>Saved Proposal History</h3>{proposalHistory.map((proposal) => <article key={proposal.id}><div><strong>{proposal.title}</strong><span>{proposal.approvalStatus}</span></div><p>{proposal.objective}</p><small>{proposal.provider.replaceAll("_", " ")} · {formatTimestamp(proposal.createdAt)} · Prompt {proposal.promptVersion} · Simulation {proposal.simulationVersion}</small></article>)}</section>}
      {history.length > 0 && <div className="portfolio-copilot-history">{history.map((item) => <ResponseCard item={item} key={`${item.generatedAt}-${item.question}`} onApprove={approveProposal} onDiscard={(target) => setHistory((items) => items.filter((entry) => entry.generatedAt !== target.generatedAt))} onEdit={(target) => { setMode("proposal"); setQuestion(target.proposal.objective); setEditingParentId(target.savedProposal?.id || target.parentProposalId || null); }} onSave={saveProposal} onSimulateProposal={(proposal) => run("/api/portfolio/copilot/scenario", proposal.objective, proposal)} />)}</div>}
    </section>
  );
}
