import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { API_BASE_URL, apiFetch, readJson } from "../../services/apiClient";

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90 };
const CONTEXT_LABELS = {
  systemPrompt: "System Prompt",
  developerPrompt: "Developer Prompt",
  userPrompt: "User Prompt",
  conversationHistory: "Conversation History",
  memoryContext: "Memory Context",
  retrievedMemories: "Retrieved Memories",
  portfolioContext: "Portfolio Context",
  strategyContext: "Strategy Context",
  matrixContext: "Matrix Context",
  researchContext: "Research Context",
  scannerContext: "Scanner Context",
  marketData: "Market Data",
  brokerContext: "Broker Context",
  playbookContext: "Playbook Context",
  validationContext: "Validation Context",
  jsonSchemas: "JSON Schemas",
  structuredOutputSchema: "Structured Output Schema",
  otherContext: "Other Context",
};

function sinceForRange(range) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (RANGE_DAYS[range] || 30));
  return date.toISOString();
}

function money(value, currency = "USD") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency,
    minimumFractionDigits: amount < 0.01 ? 4 : 2,
    maximumFractionDigits: amount < 0.01 ? 6 : 2,
  }).format(amount);
}

function integer(value) {
  return new Intl.NumberFormat("en-SG", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function featureLabel(value) {
  return String(value || "Unknown")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function MetricCard({ label, value, detail }) {
  return (
    <article className="ai-cost__metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}

function ChartPanel({ title, children }) {
  return (
    <article className="ai-cost__chart-panel">
      <h4>{title}</h4>
      <div className="ai-cost__chart">{children}</div>
    </article>
  );
}

function RequestDetail({ detail, onClose }) {
  if (!detail) return null;
  const sections = Object.entries(detail.tokenBreakdown?.sections || {})
    .filter(([, value]) => Number(value?.tokens || 0) > 0)
    .sort((a, b) => Number(b[1].tokens) - Number(a[1].tokens));

  return (
    <section className="ai-cost__detail" aria-label="AI request detail">
      <div className="ai-cost__panel-head">
        <div>
          <p className="eyebrow">Invocation detail</p>
          <h4>{featureLabel(detail.feature)}</h4>
          <span>{detail.requestId || detail.id}</span>
        </div>
        <button onClick={onClose} type="button">Close</button>
      </div>

      <div className="ai-cost__detail-grid">
        <MetricCard label="Model" value={detail.model || "Unknown"} />
        <MetricCard label="Input" value={integer(detail.inputTokens)} detail={`${integer(detail.cachedTokens)} cached`} />
        <MetricCard label="Output" value={integer(detail.outputTokens)} />
        <MetricCard label="Cost" value={money(detail.estimatedCostSgd, "SGD")} detail={money(detail.estimatedCostUsd)} />
        <MetricCard label="Latency" value={`${integer(detail.durationMs)} ms`} detail={`${detail.retryCount || 0} retries`} />
        <MetricCard label="Cache" value={detail.cacheStatus || "Unknown"} />
      </div>

      <div className="ai-cost__detail-columns">
        <div>
          <h5>Input token breakdown</h5>
          <div className="ai-cost__breakdown">
            {sections.map(([key, item]) => (
              <div className="ai-cost__breakdown-row" key={key}>
                <span>{CONTEXT_LABELS[key] || featureLabel(key)}</span>
                <strong>{integer(item.tokens)} <small>({item.percentage}%)</small></strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h5>Context analysis</h5>
          <dl className="ai-cost__facts">
            <div><dt>Largest contributor</dt><dd>{CONTEXT_LABELS[detail.largestContributor] || featureLabel(detail.largestContributor)}</dd></div>
            <div><dt>Context entropy</dt><dd>{detail.contextBreakdown?.contextEntropy ?? "-"}</dd></div>
            <div><dt>Referenced context</dt><dd>{detail.contextBreakdown?.contextReferencePct ?? 0}%</dd></div>
            <div><dt>Repeated tokens</dt><dd>{integer(detail.contextDiff?.repeatedTokens)}</dd></div>
            <div><dt>Identical context</dt><dd>{detail.contextDiff?.identicalContextPct ?? 0}%</dd></div>
            <div><dt>Finish reason</dt><dd>{detail.responseAnalysis?.finishReason || "Unknown"}</dd></div>
            <div><dt>Response JSON</dt><dd>{integer(detail.responseAnalysis?.jsonSizeBytes)} bytes</dd></div>
          </dl>
          {(detail.warnings || []).length ? (
            <div className="ai-cost__warnings">
              {(detail.warnings || []).map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <h5>Observability recommendations</h5>
        <div className="ai-cost__recommendations">
          {(detail.recommendations || []).length ? detail.recommendations.map((item) => (
            <article key={`${item.code}-${item.message}`}>
              <strong>{item.message}</strong>
              <span>Potential reduction: {integer(item.estimatedTokenReduction)} tokens</span>
            </article>
          )) : <p>No material context warning was detected for this request.</p>}
        </div>
      </div>
    </section>
  );
}

export default function AiCostDashboard() {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("createdAt");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const since = sinceForRange(range);
      const response = await apiFetch(`${API_BASE_URL}/api/ai/observability/dashboard?since=${encodeURIComponent(since)}`);
      setData(await readJson(response));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    let active = true;
    const since = sinceForRange(range);
    apiFetch(`${API_BASE_URL}/api/ai/observability/dashboard?since=${encodeURIComponent(since)}`)
      .then(readJson)
      .then((payload) => { if (active) setData(payload); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [range]);

  const changeRange = useCallback((value) => {
    setLoading(true);
    setError("");
    setRange(value);
  }, []);

  const loadDetail = useCallback(async (id) => {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/ai/observability/requests/${id}`);
      setSelected(await readJson(response));
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  const recent = useMemo(() => {
    const rows = [...(data?.recent || [])];
    const selectors = {
      createdAt: (row) => new Date(row.timestamp).getTime(),
      tokens: (row) => Number(row.totalTokens || 0),
      cost: (row) => Number(row.estimatedCostUsd || 0),
      latency: (row) => Number(row.durationMs || 0),
      memory: (row) => Number(row.memoryContextTokens || 0),
      strategy: (row) => Number(row.strategyContextTokens || 0),
    };
    return rows.sort((a, b) => selectors[sort](b) - selectors[sort](a));
  }, [data?.recent, sort]);

  const summary = data?.summary || {};
  const allTime = summary.allTime || {};

  return (
    <section className="admin-dashboard__panel ai-cost">
      <div className="admin-dashboard__panel-head ai-cost__header">
        <div>
          <p className="eyebrow">AI observability</p>
          <h3>AI Cost & Context</h3>
          <span>Provider usage, configured cost, context composition, retries, cache and redundancy.</span>
        </div>
        <div className="ai-cost__controls">
          <select aria-label="AI dashboard range" onChange={(event) => changeRange(event.target.value)} value={range}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button onClick={load} type="button">Refresh</button>
        </div>
      </div>

      {error ? <div className="admin-dashboard__banner error">{error}</div> : null}
      {loading ? <p className="ai-cost__loading">Loading AI diagnostics…</p> : null}

      {!loading && data ? (
        <>
          <div className="ai-cost__metrics">
            <MetricCard label="Total AI cost" value={money(allTime.totalCostSgd, "SGD")} detail={money(allTime.totalCostUsd)} />
            <MetricCard label="Today" value={money(summary.today?.totalCostSgd, "SGD")} />
            <MetricCard label="This week" value={money(summary.week?.totalCostSgd, "SGD")} />
            <MetricCard label="This month" value={money(summary.month?.totalCostSgd, "SGD")} />
            <MetricCard label="Average / request" value={money(summary.averageCostPerRequestUsd)} />
            <MetricCard label="Average tokens" value={integer(summary.averageTokensPerRequest)} />
            <MetricCard label="Average latency" value={`${integer(summary.averageLatencyMs)} ms`} />
            <MetricCard label="Pricing coverage" value={`${summary.pricingCoveragePct || 0}%`} />
            <MetricCard label="Most expensive feature" value={featureLabel(summary.mostExpensiveFeature?.key)} />
            <MetricCard label="Most expensive user" value={summary.mostExpensiveUser?.key || "No data"} />
            <MetricCard label="Largest context" value={integer(summary.largestContext?.inputTokens)} detail="input tokens" />
            <MetricCard label="Largest memory retrieval" value={integer(summary.largestMemoryRetrieval?.memoryContextTokens)} detail="memory tokens" />
          </div>

          <div className="ai-cost__charts-grid">
            <ChartPanel title="Daily cost (USD)">
              <ResponsiveContainer width="100%" height="100%"><LineChart data={data.daily}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="period" /><YAxis /><Tooltip /><Line dataKey="totalCostUsd" stroke="#37d6c3" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Daily token usage">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={data.daily}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="period" /><YAxis /><Tooltip /><Bar dataKey="totalTokens" fill="#7c9cff" /></BarChart></ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Feature cost (USD)">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={(data.features || []).slice(0, 10)} layout="vertical"><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis type="number" /><YAxis dataKey="feature" type="category" width={105} tickFormatter={featureLabel} /><Tooltip labelFormatter={featureLabel} /><Bar dataKey="totalCostUsd" fill="#37d6c3" /></BarChart></ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Feature latency (p95 ms)">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={(data.features || []).slice(0, 10)} layout="vertical"><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis type="number" /><YAxis dataKey="feature" type="category" width={105} tickFormatter={featureLabel} /><Tooltip labelFormatter={featureLabel} /><Bar dataKey="p95LatencyMs" fill="#f4b860" /></BarChart></ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Model usage">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={data.models || []}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="model" /><YAxis /><Tooltip /><Bar dataKey="requests" fill="#a78bfa" /></BarChart></ResponsiveContainer>
            </ChartPanel>
            <ChartPanel title="Top context contributors">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={(data.contextContributors || []).slice(0, 10)} layout="vertical"><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis type="number" /><YAxis dataKey="section" type="category" width={115} tickFormatter={(value) => CONTEXT_LABELS[value] || featureLabel(value)} /><Tooltip labelFormatter={(value) => CONTEXT_LABELS[value] || featureLabel(value)} /><Bar dataKey="tokens" fill="#ff7a90" /></BarChart></ResponsiveContainer>
            </ChartPanel>
          </div>

          <section className="ai-cost__timeline">
            <div className="ai-cost__panel-head">
              <div><h4>Invocation timeline</h4><span>{recent.length} recent requests</span></div>
              <select aria-label="Sort AI invocation timeline" onChange={(event) => setSort(event.target.value)} value={sort}>
                <option value="createdAt">Newest</option>
                <option value="tokens">Largest token usage</option>
                <option value="cost">Largest cost</option>
                <option value="latency">Slowest request</option>
                <option value="memory">Largest memory context</option>
                <option value="strategy">Largest strategy context</option>
              </select>
            </div>
            <div className="admin-dashboard__table-wrap">
              <table className="admin-dashboard__table ai-cost__table">
                <thead><tr><th>Time</th><th>Feature</th><th>Model</th><th>Input</th><th>Output</th><th>Cost</th><th>Latency</th><th>Status</th><th>Retry</th><th>Cache</th></tr></thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={row.id} onClick={() => loadDetail(row.id)}>
                      <td>{new Date(row.timestamp).toLocaleString()}</td><td>{featureLabel(row.feature)}</td><td>{row.model || "-"}</td><td>{integer(row.inputTokens)}</td><td>{integer(row.outputTokens)}</td><td>{money(row.estimatedCostSgd, "SGD")}</td><td>{integer(row.durationMs)} ms</td><td>{row.status}</td><td>{row.retryCount}</td><td>{row.cacheStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ai-cost__optimization">
            <div><h4>Optimization evidence</h4><span>Reporting only. No prompt or context changes are applied.</span></div>
            <div className="ai-cost__metrics">
              <MetricCard label="Potential token reduction" value={integer(data.optimization?.estimatedTokenReduction)} />
              <MetricCard label="Potential monthly USD" value={money(data.optimization?.estimatedCostReductionUsd)} />
              <MetricCard label="Potential monthly SGD" value={money(data.optimization?.estimatedCostReductionSgd, "SGD")} />
              <MetricCard label="Potential latency" value={`${integer(data.optimization?.estimatedLatencyReductionMs)} ms`} />
            </div>
          </section>
        </>
      ) : null}

      <RequestDetail detail={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
