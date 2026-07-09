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

function ChartPanel({ children, title, subtitle, hasData = true }) {
  return (
    <article className="chart-panel">
      <div>
        <p className="eyebrow">{title}</p>
        <span>{subtitle}</span>
      </div>
      {hasData ? children : <p className="alerts-empty">No chart data available.</p>}
    </article>
  );
}

function formatValidationValue(value, suffix = "") {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return `${number.toFixed(2)}${suffix}`;
}

function ValidationGroupTable({ rows = [], title }) {
  return (
    <article className="validation-card">
      <div className="validation-card-header">
        <div>
          <p className="eyebrow">Validation</p>
          <h3>{title}</h3>
        </div>
        <span>{rows.length} groups</span>
      </div>
      {rows.length > 0 ? (
        <div className="validation-table validation-table-compact">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Samples</th>
                <th>Predicted</th>
                <th>Actual Win</th>
                <th>Drawdown</th>
                <th>Reliability</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>{row.sampleCount ?? row.outcome_samples}/{row.samples}</td>
                  <td>{formatValidationValue(row.predictedConfidence, "%")}</td>
                  <td className={Number(row.average_return ?? row.average_next_period_return) >= 0 ? "positive" : "negative"}>
                    {formatValidationValue(row.actualWinRate ?? row.win_rate, "%")}
                  </td>
                  <td className="negative">{formatValidationValue(row.average_drawdown, "%")}</td>
                  <td>{row.evidenceScore || "LOW"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="validation-empty">
          Validation dataset not built yet. Run scans and allow signals to accumulate.
        </p>
      )}
    </article>
  );
}

function ValidationMetricCard({ label, value, detail, tone = "neutral" }) {
  return (
    <article className={`validation-metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </article>
  );
}

function ValidationDashboard({
  confidenceData,
  error,
  openAiData,
  onRefresh,
  regimeData,
  sectorData,
}) {
  const confidenceRows = confidenceData?.confidence || [];
  const warnings = confidenceData?.warnings || [];
  const totals = confidenceData?.totals || {};
  const diagnostics = confidenceData?.diagnostics || {};
  const maturityFunnel = confidenceData?.maturity_funnel || [];
  const sampleGrowth = confidenceData?.sample_growth || [];
  const calibrationDrift = confidenceData?.calibration_drift || [];
  const insights = confidenceData?.insights || [];
  const datasetBuilt = Boolean(confidenceData?.dataset_built);
  const isMockData = Boolean(confidenceData?.is_mock_data);
  const totalSignals = Number(totals.signals || 0);
  const evaluatedSignals = Number(totals.evaluated || 0);
  const coverage = totalSignals > 0 ? (evaluatedSignals / totalSignals) * 100 : 0;
  const emptyStateMessage =
    confidenceData?.empty_state_message ||
    (confidenceData?.is_mock_data
      ? "Validation dataset not built yet. Run scans and allow signals to accumulate."
      : "");
  const chartRows = confidenceRows.map((row) => ({
    bucket: row.label,
    predictedConfidence: Number(row.predictedConfidence ?? 0),
    actualWinRate:
      row.actualWinRate ?? row.win_rate ?? null,
    avgReturn: row.average_return ?? row.average_next_period_return ?? null,
    samples: Number((row.sampleCount ?? row.outcome_samples) || 0),
  }));
  const hasOutcomeData = confidenceRows.some((row) => Number((row.sampleCount ?? row.outcome_samples) || 0) > 0);
  const highSeverityWarnings = warnings.filter((warning) => warning.severity === "HIGH").length;
  const dataTone = datasetBuilt ? "positive" : isMockData ? "warning" : "neutral";
  const dataStatus = hasOutcomeData ? "Evidence live" : datasetBuilt ? "Collecting evidence" : "Waiting";

  return (
    <section className="validation-panel">
      <div className="validation-hero">
        <div>
          <p className="eyebrow">Validation</p>
          <h2>Confidence Calibration</h2>
          <p>
            Checks whether higher confidence scores are actually producing better
            forward outcomes across buckets, regimes, sectors, and AI/news adjustments.
          </p>
        </div>
        <div className="validation-actions">
          <button className="direction-toggle" onClick={onRefresh} type="button">
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="engine-error validation-error">{error}</p>}

      <div className={`validation-status-banner ${dataTone}`}>
        <div>
          <span>Data status</span>
          <strong>{dataStatus}</strong>
        </div>
        <p>
          {emptyStateMessage ||
            "Validation records are being built from scanner history. Evaluate signals after prices have enough future data."}
        </p>
      </div>

      <div className="validation-metrics-grid">
        <ValidationMetricCard
          detail={isMockData ? "Charts are using starter records" : "Stored from scanner runs"}
          label="Dataset"
          tone={dataTone}
          value={datasetBuilt ? "Built" : isMockData ? "Sample" : "Pending"}
        />
        <ValidationMetricCard label="Signals" value={totalSignals} detail="Total stored signals" />
        <ValidationMetricCard
          detail={`${formatValidationValue(diagnostics.coverage ?? coverage, "%")} coverage`}
          label="Evaluated"
          tone={coverage >= 75 ? "positive" : coverage > 0 ? "warning" : "neutral"}
          value={evaluatedSignals}
        />
        <ValidationMetricCard label="Pending" value={diagnostics.pendingMaturity ?? 0} detail="Waiting for maturity" />
        <ValidationMetricCard
          detail={highSeverityWarnings ? `${highSeverityWarnings} high severity` : "No high severity warnings"}
          label="Warnings"
          tone={warnings.length ? "warning" : "positive"}
          value={warnings.length}
        />
      </div>

      {warnings.length > 0 && (
        <div className="validation-warning-grid">
          {warnings.map((warning) => (
            <article
              className={`validation-warning ${warning.severity?.toLowerCase() || "medium"}`}
              key={`${warning.type}-${warning.message}`}
            >
              <span>{warning.severity}</span>
              <strong>{warning.type.replaceAll("_", " ")}</strong>
              <p>{warning.message}</p>
            </article>
          ))}
        </div>
      )}

      <section className="validation-grid">
        <ValidationMetricCard
          detail="Signals generated"
          label="Generated"
          value={diagnostics.signalsGenerated ?? totalSignals}
        />
        <ValidationMetricCard
          detail="Outcome rows available"
          label="Matured"
          value={diagnostics.signalsMatured ?? 0}
        />
        <ValidationMetricCard
          detail="Evaluation failures"
          label="Failed"
          tone={Number(diagnostics.evaluationFailures || 0) ? "warning" : "positive"}
          value={diagnostics.evaluationFailures ?? 0}
        />
        <ValidationMetricCard
          detail="Current vs historical confidence"
          label="Confidence Drift"
          value={formatValidationValue(diagnostics.calibrationDrift, "%")}
        />
      </section>

      <section className="validation-chart-grid">
        <ChartPanel
          hasData={hasOutcomeData}
          subtitle="Predicted confidence compared with observed win rate"
          title="Confidence vs Actual Win Rate"
        >
          <div className="chart-canvas validation-chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
                <XAxis dataKey="bucket" stroke="#9aa9b8" />
                <YAxis stroke="#9aa9b8" width={54} />
                <Tooltip
                  contentStyle={{
                    background: "#111720",
                    border: "1px solid #263242",
                    borderRadius: 8,
                    color: "#eef2f6",
                  }}
                />
                <Bar dataKey="predictedConfidence" fill="#58a6ff" name="Model Confidence %" radius={[6, 6, 0, 0]} />
                <Bar dataKey="actualWinRate" fill="#4cc38a" name="Actual Win Rate %" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>

        <article className="validation-card validation-readout-card">
          <div>
            <p className="eyebrow">Reading</p>
            <h3>{hasOutcomeData ? "What to look for" : "Outcomes are still maturing"}</h3>
          </div>
          <p>
            A healthy model should show stronger returns and win rates as confidence
            rises. If high-confidence buckets underperform, the next step is calibration,
            not changing the live strategy blindly.
          </p>
          <dl>
            <div>
              <dt>Best signal</dt>
              <dd>Higher bucket outperformance</dd>
            </div>
            <div>
              <dt>Weak signal</dt>
              <dd>Flat or inverted bucket results</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="validation-chart-grid">
        <ChartPanel
          hasData={sampleGrowth.length > 0}
          subtitle="Signals stored versus evaluated outcomes over time"
          title="Sample Growth"
        >
          <div className="chart-canvas validation-chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sampleGrowth}>
                <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#9aa9b8" />
                <YAxis stroke="#9aa9b8" width={54} />
                <Tooltip contentStyle={{ background: "#111720", border: "1px solid #263242", borderRadius: 8, color: "#eef2f6" }} />
                <Line dataKey="cumulativeSignals" dot={false} stroke="#58a6ff" strokeWidth={2} type="monotone" />
                <Line dataKey="cumulativeEvaluated" dot={false} stroke="#4cc38a" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
        <ChartPanel
          hasData={calibrationDrift.length > 0}
          subtitle="Monthly observed win rate versus model confidence"
          title="Calibration Drift"
        >
          <div className="chart-canvas validation-chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calibrationDrift}>
                <CartesianGrid stroke="#253140" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#9aa9b8" />
                <YAxis stroke="#9aa9b8" width={54} />
                <Tooltip contentStyle={{ background: "#111720", border: "1px solid #263242", borderRadius: 8, color: "#eef2f6" }} />
                <Line dataKey="predictedConfidence" dot={false} stroke="#58a6ff" strokeWidth={2} type="monotone" />
                <Line dataKey="actualWinRate" dot={false} stroke="#4cc38a" strokeWidth={2} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartPanel>
      </section>

      <article className="validation-card">
        <div className="validation-card-header">
          <div>
            <p className="eyebrow">Diagnostics</p>
            <h3>Maturity Funnel</h3>
          </div>
          <span>{formatValidationValue(diagnostics.coverage, "%")} coverage</span>
        </div>
        <div className="validation-metrics-grid">
          {maturityFunnel.map((item) => (
            <ValidationMetricCard
              key={item.key}
              label={item.key}
              value={item.value}
            />
          ))}
        </div>
      </article>

      <article className="validation-card">
        <div className="validation-card-header">
          <div>
            <p className="eyebrow">Buckets</p>
            <h3>Confidence Bucket Outcomes</h3>
          </div>
          <span>{confidenceRows.length} buckets</span>
        </div>
        {confidenceRows.length > 0 ? (
          <div className="validation-table">
            <table>
              <thead>
                <tr>
                  <th>Confidence Bucket</th>
                  <th>Samples</th>
                  <th>Model Confidence</th>
                  <th>Historical Win Probability</th>
                  <th>Avg Return</th>
                  <th>Calibration Error</th>
                  <th>Avg Drawdown</th>
                  <th>Reliability</th>
                </tr>
              </thead>
              <tbody>
                {confidenceRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.label}</strong>
                    </td>
                    <td>{row.sampleCount ?? row.outcome_samples}/{row.samples}</td>
                    <td>{formatValidationValue(row.predictedConfidence, "%")}</td>
                    <td>{formatValidationValue(row.historicalWinProbability ?? row.actualWinRate, "%")}</td>
                    <td className={Number(row.average_return ?? row.average_next_period_return) >= 0 ? "positive" : "negative"}>
                      {formatValidationValue(row.average_return ?? row.average_next_period_return, "%")}
                    </td>
                    <td>{formatValidationValue(row.calibrationError, "%")}</td>
                    <td className="negative">{formatValidationValue(row.average_drawdown, "%")}</td>
                    <td>{row.confidenceLevel || row.evidenceScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="validation-empty">
            Validation dataset not built yet. Run scans and allow signals to accumulate.
          </p>
        )}
      </article>

      <section className="validation-grid">
        <ValidationGroupTable
          rows={regimeData?.regime || []}
          title="By Market Regime"
        />
        <ValidationGroupTable rows={sectorData?.sector || []} title="By Sector" />
        <ValidationGroupTable rows={confidenceData?.exchange || []} title="By Exchange" />
        <ValidationGroupTable rows={confidenceData?.strategy || []} title="By Strategy" />
        <ValidationGroupTable rows={confidenceData?.horizon || []} title="By Horizon" />
        <ValidationGroupTable
          rows={openAiData?.openai_impact || []}
          title="By OpenAI Adjustment"
        />
        <ValidationGroupTable
          rows={openAiData?.news_impact || []}
          title="By News Adjustment"
        />
      </section>

      <article className="validation-card">
        <div className="validation-card-header">
          <div>
            <p className="eyebrow">Evidence</p>
            <h3>Deterministic Insights</h3>
          </div>
          <span>{insights.length} insights</span>
        </div>
        {insights.length > 0 ? (
          <div className="validation-warning-grid">
            {insights.map((insight) => (
              <article className="validation-warning low" key={`${insight.type}-${insight.title}`}>
                <span>{insight.confidenceLevel}</span>
                <strong>{insight.title}</strong>
                <p>{insight.explanation}</p>
                <small>{insight.sampleCount} supporting signals</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="validation-empty">
            Collecting evidence. Deterministic insights appear after enough evaluated samples exist.
          </p>
        )}
      </article>
    </section>
  );
}

export default ValidationDashboard;
