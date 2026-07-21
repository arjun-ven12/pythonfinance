import { useState } from "react";
import { API_BASE_URL, apiFetch } from "../../services/apiClient";
import ResearchWorkspace from "./ResearchWorkspace";
import HistoricalContextUsed from "../../components/common/HistoricalContextUsed";
import { formatNumber, formatNumericValue } from "../../utils/numberFormat";

const WORKFLOWS = [
  ["overview", "Market Brief", "/api/research/copilot/overview"], ["ask", "Ask Research", "/api/research/copilot/ask"],
  ["symbol", "Symbol", "/api/research/copilot/symbol"], ["sector", "Sector / Theme", "/api/research/copilot/sector"],
  ["scanner", "Scanner", "/api/research/copilot/scanner-summary"], ["watchlist", "Watchlist", "/api/research/copilot/watchlist-summary"],
  ["upcoming", "Upcoming", "/api/research/copilot/upcoming"],
  ["deep", "Deep Research", "/api/research/copilot/deep"], ["compare", "Compare", "/api/research/copilot/compare"],
  ["marketImpact", "Market Impact", "/api/research/copilot/impact/market"], ["portfolioImpact", "Portfolio Impact", "/api/research/copilot/impact/portfolio"],
  ["strategyImpact", "Strategy Impact", "/api/research/copilot/impact/strategy"], ["matrixImpact", "Matrix Impact", "/api/research/copilot/impact/matrix"],
  ["scannerImpact", "Scanner Impact", "/api/research/copilot/impact/scanner"], ["company", "Company Research", "/api/research/copilot/company"],
  ["theme", "Theme Research", "/api/research/copilot/theme"],
];

const SUGGESTIONS = [
  { label: "Research AI Infrastructure", query: "AI Infrastructure", workflow: "deep" },
  { label: "Compare NVIDIA vs AMD", query: "NVDA vs AMD", workflow: "compare" },
  { label: "How does today's CPI affect my portfolio?", query: "How does today's CPI affect my portfolio?", workflow: "portfolioImpact" },
  { label: "Which strategies benefit?", query: "Which strategies benefit in the current market?", workflow: "strategyImpact" },
  { label: "Which matrix cells are affected?", query: "Which matrix cells are affected by the current market?", workflow: "matrixImpact" },
  { label: "Why did my scanner find these opportunities?", query: "Why did my scanner find these opportunities?", workflow: "scannerImpact" },
];
const SYMBOL_ALIASES = { NVIDIA: "NVDA", ADVANCEDMICRODEVICES: "AMD", GOOGLE: "GOOGL", ALPHABET: "GOOGL", META: "META" };
const SAVED_REPORT_TYPES = { MARKET_OVERVIEW: "MARKET_OVERVIEW", QUESTION: "MARKET_OVERVIEW", SYMBOL_RESEARCH: "SYMBOL_RESEARCH", COMPANY_RESEARCH: "SYMBOL_RESEARCH", SECTOR_RESEARCH: "SECTOR_RESEARCH", THEME_RESEARCH: "THEME_RESEARCH", DEEP_RESEARCH: "THEME_RESEARCH", COMPARISON_RESEARCH: "COMPANY_COMPARISON", MARKET_IMPACT: "MARKET_OVERVIEW", PORTFOLIO_IMPACT: "PORTFOLIO_IMPACT", STRATEGY_IMPACT: "STRATEGY_IMPACT", MATRIX_IMPACT: "MATRIX_IMPACT", SCANNER_IMPACT: "SCANNER_IMPACT", SCANNER_EXPLANATION: "SCANNER_IMPACT", WATCHLIST_SUMMARY: "THEME_RESEARCH", UPCOMING_EVENTS: "MACRO_RESEARCH" };

function formatTime(value) { if (!value) return "Unavailable"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString(); }
function comparisonSymbol(value) { const compact = String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase(); return SYMBOL_ALIASES[compact] || compact; }
function displayMetric(item) { const value = formatNumericValue(item.metricValue); return item.metricName?.toLowerCase().includes("pct") && Number.isFinite(Number(item.metricValue)) ? `${value}%` : value; }

function EvidenceGrid({ items = [] }) {
  if (!items.length) return <p className="research-empty">Insufficient evidence available.</p>;
  return <div className="research-evidence-grid">{items.map((item) => <article key={`${item.sourceType}-${item.sourceId}-${item.metricName}`}><header><span>{item.sourceType.replaceAll("_", " ")}</span><b>{item.sourceQuality} source</b></header><strong>{item.symbol || item.sector || item.theme || item.metricName}</strong><p>{item.metricName}: {displayMetric(item)}</p><small>{item.sourceName} · {formatTime(item.timestamp)}</small><em>{item.interpretation}</em></article>)}</div>;
}

function RelationshipMap({ value = {} }) {
  const nodes = value.nodes || []; const edges = value.edges || [];
  if (!nodes.length) return <p className="research-empty">No evidence-backed cross-system relationship is available.</p>;
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  return <div className="research-map"><div className="research-map-nodes">{nodes.map((node) => <article key={node.id}><span>{node.system}</span><strong>{node.label}</strong><small>{node.classification.replaceAll("_", " ")}</small></article>)}</div><div className="research-map-edges">{edges.map((edge, index) => <p key={`${edge.from}-${edge.to}-${index}`}><b>{labels.get(edge.from) || edge.from}</b><span>→</span><b>{labels.get(edge.to) || edge.to}</b><em>{edge.relationship} · {formatNumber(edge.confidence)}/100</em></p>)}</div></div>;
}

function ResearchReportSections({ report = {} }) {
  const sections = [["Current Situation", report.currentSituation], ["Bull Case", report.bullCase], ["Bear Case", report.bearCase], ["Major Catalysts", report.majorCatalysts], ["Major Risks", report.majorRisks], ["Historical Context", report.historicalContext], ["Macro Environment", report.macroEnvironment], ["Sector Analysis", report.sectorAnalysis], ["Relevant Companies", report.relevantCompanies], ["Key Unknowns", report.keyUnknowns]];
  if (!sections.some(([, values]) => values?.length)) return null;
  return <section><h3>Research Report</h3><div className="research-report-grid">{sections.filter(([, values]) => values?.length).map(([title, values]) => <article key={title}><h4>{title}</h4><ul>{values.map((value) => <li key={value}>{value}</li>)}</ul></article>)}</div></section>;
}

function AffectedSystems({ value = {} }) {
  const systems = [["Portfolio", value.portfolio], ["Strategies", value.strategies], ["Matrix", value.matrix], ["Scanner", value.scanner], ["Watchlist", value.watchlist]];
  if (!systems.some(([, values]) => values?.length)) return null;
  return <section><h3>Affected Trading System</h3><div className="research-impact-grid">{systems.filter(([, values]) => values?.length).map(([title, values]) => <article key={title}><span>{title}</span>{values.map((value) => <p key={value}>{value}</p>)}</article>)}</div></section>;
}

function ResearchResult({ item, onSave }) {
  const response = item.response;
  return <article className="research-report">
    <header><div><span>{item.workflow.replaceAll("_", " ")}</span><h2>{item.question || "Market Brief"}</h2></div><div className="research-report-actions"><strong>{formatNumber(response.confidenceScore)}/100 confidence</strong><button onClick={() => onSave(item)} type="button">Save as Project</button></div></header>
    {item.freshness?.staleSources?.length > 0 && <p className="research-warning">Stale or missing sources: {item.freshness.staleSources.join(", ")}</p>}
    <section className="research-executive"><span>Executive Summary</span><p>{response.executiveSummary}</p></section>
    <section><h3>Relationship Map</h3><RelationshipMap value={response.relationshipMap} /></section>
    <section><h3>Prioritized Findings</h3><div className="research-findings">{response.keyFindings.map((finding) => <article key={`${finding.priority}-${finding.title}`}><b>0{finding.priority}</b><div><span>{finding.classification.replaceAll("_", " ")}</span><h4>{finding.title}</h4><p>{finding.finding}</p><small>{finding.whyItMatters}</small>{finding.affectedSymbols.length > 0 && <footer>{finding.affectedSymbols.join(" · ")}</footer>}</div></article>)}</div></section>
    <div className="research-two-column"><section><h3>Why It Matters</h3><ul>{response.whyItMatters.map((value) => <li key={value}>{value}</li>)}</ul></section><section><h3>Risks / Alternative Interpretations</h3><ul>{response.risksAlternativeInterpretations.map((value) => <li key={value}>{value}</li>)}</ul></section></div>
    <AffectedSystems value={response.affectedSystems} />
    <ResearchReportSections report={response.report} />
    <section><h3>Evidence Terminal</h3><EvidenceGrid items={response.evidence} /></section>
    <HistoricalContextUsed context={response.historicalContextUsed} />
    <div className="research-two-column"><section><h3>Limitations</h3><ul>{response.limitations.map((value) => <li key={value}>{value}</li>)}</ul></section><section><h3>Suggested Follow-Ups</h3><ul>{response.suggestedFollowUpQuestions.map((value) => <li key={value}>{value}</li>)}</ul></section></div>
    <footer className="research-freshness">Market {formatTime(item.freshness?.marketDataTimestamp)} · News {formatTime(item.freshness?.newsTimestamp)} · Scanner {formatTime(item.freshness?.scannerTimestamp)} · Regime {formatTime(item.freshness?.regimeTimestamp)}</footer>
  </article>;
}

export default function ResearchPage() {
  const [surface, setSurface] = useState("live");
  const [workflow, setWorkflow] = useState("overview"); const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const config = WORKFLOWS.find(([key]) => key === workflow);
  const topicWorkflow = ["deep", "company", "theme", "compare"].includes(workflow);
  const impactWorkflow = workflow.endsWith("Impact");
  async function run() {
    const value = query.trim();
    if (workflow !== "overview" && workflow !== "scanner" && workflow !== "watchlist" && workflow !== "upcoming" && !value) { setError("Enter a research question, symbol, sector, or theme."); return; }
    setLoading(true); setError("");
    try {
      const body = { question: value || (workflow === "overview" ? "What happened in the market today?" : workflow === "scanner" ? "Explain the latest scanner results." : workflow === "watchlist" ? "Which watchlist symbols need attention?" : "What should I monitor next?") };
      if (workflow === "symbol") body.symbol = value.toUpperCase();
      if (workflow === "sector") body.sector = value;
      if (workflow === "company") body.symbol = value.toUpperCase();
      if (workflow === "theme" || workflow === "deep") body.theme = value;
      if (workflow === "compare") body.symbols = value.split(/\s+vs\.?\s+|,/i).map(comparisonSymbol).filter(Boolean).slice(0, 2);
      const response = await apiFetch(`${API_BASE_URL}${config[2]}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Research request failed.");
      setHistory((current) => [{ ...payload, question: body.question }, ...current]); setQuery("");
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }
  async function saveAsProject(item) {
    setLoading(true); setError("");
    try {
      const title = item.question || `${item.workflow.replaceAll("_", " ")} research`;
      const reportType = SAVED_REPORT_TYPES[item.workflow] || "THEME_RESEARCH";
      const response = await apiFetch(`${API_BASE_URL}/api/research/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, topic: title, researchType: reportType, scope: { topic: title }, sourceReportType: reportType, sourceResponse: item.response, sourceFreshness: item.freshness }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not save research project."); setSurface("workspace");
    } catch (requestError) { setError(requestError.message); } finally { setLoading(false); }
  }
  return <main className="research-page">
    <nav className="research-surface-switch" aria-label="Research area"><button aria-pressed={surface === "live"} onClick={() => setSurface("live")} type="button">Live Intelligence</button><button aria-pressed={surface === "workspace"} onClick={() => setSurface("workspace")} type="button">Research Workspace</button></nav>
    {surface === "workspace" ? <ResearchWorkspace /> : <>
    <section className="research-hero"><div><p className="eyebrow">Research Copilot · Cross-System Intelligence</p><h1>What does this mean for your trading system?</h1><p>Evidence-backed links across market, regime, scanner, portfolio, strategies, matrix deployment, and saved research.</p></div><span>RESEARCH ONLY</span></section>
    <section className="research-console"><div className="research-workflows" aria-label="Research workflow">{WORKFLOWS.map(([key, label]) => <button aria-pressed={workflow === key} key={key} onClick={() => setWorkflow(key)} type="button">{label}</button>)}</div>
      <label htmlFor="research-query">{workflow === "symbol" ? "Symbol" : workflow === "company" ? "Company or symbol" : workflow === "sector" || workflow === "theme" || workflow === "deep" ? "Research topic" : workflow === "compare" ? "Compare" : "Research question"}</label>
      <div className="research-query"><input id="research-query" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") run(); }} placeholder={workflow === "symbol" || workflow === "company" ? "NVDA" : workflow === "sector" || workflow === "theme" || workflow === "deep" ? "AI Infrastructure" : workflow === "compare" ? "NVDA vs AMD" : "What matters most to my trading system?"} value={query} /><button disabled={loading} onClick={run} type="button">{loading ? "Researching..." : workflow === "overview" ? "Generate Market Brief" : topicWorkflow ? "Build Research Report" : impactWorkflow ? "Analyze Impact" : "Run Research"}</button></div>
      <div className="research-chips">{SUGGESTIONS.map((suggestion) => <button key={suggestion.label} onClick={() => { setWorkflow(suggestion.workflow); setQuery(suggestion.query); }} type="button">{suggestion.label}</button>)}</div>
      <div aria-live="polite">{error && <p className="engine-error">{error}</p>}{loading && <p className="research-status">Ranking current evidence and checking freshness...</p>}</div>
    </section>
    {history.length === 0 && !loading && <section className="research-empty-state"><strong>No research brief generated yet.</strong><p>Choose a workflow or start with a suggested question.</p></section>}
    <section className="research-history">{history.map((item) => <ResearchResult item={item} key={`${item.generatedAt}-${item.question}`} onSave={saveAsProject} />)}</section></>}
  </main>;
}
