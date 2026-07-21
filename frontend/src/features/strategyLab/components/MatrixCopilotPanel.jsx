import { useEffect, useState } from "react";
import { API_BASE_URL, apiFetch } from "../../../services/apiClient";
import HistoricalContextUsed from "../../../components/common/HistoricalContextUsed";
import { formatNumber, formatNumericValue } from "../../../utils/numberFormat";

const MODES = [
  ["MATRIX_EXPLANATION", "Overview"],
  ["MATRIX_AUDIT", "Matrix Audit"],
  ["MATRIX_REPLAY_ANALYSIS", "Replay Analysis"],
  ["MATRIX_DEPLOYMENT_ANALYSIS", "Deployment"],
  ["MATRIX_ALLOCATION_ANALYSIS", "Allocation"],
  ["MATRIX_COVERAGE_ANALYSIS", "Coverage"],
  ["MATRIX_RISK_ANALYSIS", "Risk"],
  ["MATRIX_QUESTION", "Ask Matrix Copilot"],
];
const PROMPTS = [
  "Explain my deployment matrix",
  "Audit my matrix",
  "Explain today's deployment",
  "Why is this strategy here?",
  "Where is my risk concentrated?",
  "Why did replay underperform?",
];

function Metric({ label, value }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
function List({ values = [], empty = "No evidence-backed findings." }) {
  return values.length ? (
    <ul>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  ) : (
    <p className="alerts-empty">{empty}</p>
  );
}

export default function MatrixCopilotPanel() {
  const [surface, setSurface] = useState("audit");
  const [mode, setMode] = useState("MATRIX_EXPLANATION");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scenarioHistory, setScenarioHistory] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selectedDraft, setSelectedDraft] = useState(null);
  async function request(path, options = {}) {
    const response = await apiFetch(`${API_BASE_URL}${path}`, options);
    const payload = await response.json();
    if (!response.ok)
      throw new Error(payload.error || "Matrix Copilot request failed.");
    return payload;
  }
  async function loadDrafts(includeDeleted = false) {
    try {
      const payload = await request(
        `/api/strategy-lab/matrix-copilot/proposals?includeDeleted=${includeDeleted}`,
      );
      setDrafts(payload.proposals || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  }
  useEffect(() => {
    if (["drafts", "deploy"].includes(surface))
      loadDrafts(surface === "drafts");
  }, [surface]);
  async function saveDraft() {
    if (!result?.proposal) return;
    setLoading(true);
    setError("");
    try {
      const draft = await request(
        "/api/strategy-lab/matrix-copilot/proposals",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposal: result.proposal,
            sourcePrompt: question,
          }),
        },
      );
      setSelectedDraft(draft);
      await loadDrafts();
      setSurface("drafts");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }
  async function draftAction(draft, action, body = null) {
    setLoading(true);
    setError("");
    try {
      const suffix = ["delete", "rename"].includes(action) ? "" : `/${action}`;
      const payload = await request(
        `/api/strategy-lab/matrix-copilot/proposals/${draft.id}${suffix}`,
        {
          method:
            action === "delete"
              ? "DELETE"
              : action === "rename"
                ? "PATCH"
                : "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      if (action === "approve") setSelectedDraft(payload.proposal);
      else setSelectedDraft(payload);
      await loadDrafts(surface === "drafts");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }
  async function run(overrideQuestion) {
    const text = String(overrideQuestion ?? question).trim();
    if (surface === "audit" && mode === "MATRIX_QUESTION" && !text) {
      setError("Enter a matrix question.");
      return;
    }
    if (surface !== "audit" && !text && surface !== "compare") {
      setError("Describe the matrix objective you want to investigate.");
      return;
    }
    if (surface === "compare" && scenarioHistory.length < 2) {
      setError(
        "Simulate at least two scenarios before comparing alternatives.",
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      const path =
        surface === "recommend"
          ? "/api/strategy-lab/matrix-copilot/recommend"
          : surface === "simulate"
            ? "/api/strategy-lab/matrix-copilot/scenario"
            : surface === "compare"
              ? "/api/strategy-lab/matrix-copilot/compare"
              : "/api/strategy-matrix/copilot";
      const body =
        surface === "audit"
          ? { workflow: mode, question: text }
          : surface === "compare"
            ? {
                question: text || "Compare the saved matrix scenarios.",
                proposals: scenarioHistory
                  .slice(0, 4)
                  .map((item) => item.proposal),
              }
            : { question: text };
      const response = await apiFetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Matrix Copilot request failed.");
      setResult(payload);
      if (surface === "simulate" && payload.proposal)
        setScenarioHistory((current) => [payload, ...current].slice(0, 4));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }
  const response = result?.response;
  const audit = result?.audit;
  const proposal = result?.proposal;
  const comparison = result?.comparison;
  return (
    <section className="strategy-lab-card matrix-copilot-panel">
      <header className="matrix-copilot-header">
        <div>
          <p className="eyebrow">Strategy Copilot · Matrix Intelligence</p>
          <h2>Deployment matrix workflow</h2>
          <p>
            Natural-language proposals, deterministic replay, and explicit human
            approval.
          </p>
        </div>
        <span>HUMAN APPROVAL REQUIRED</span>
      </header>
      <nav aria-label="Matrix advisor mode" className="matrix-advisor-surfaces">
        {[
          ["audit", "Audit"],
          ["recommend", "Recommend"],
          ["simulate", "Simulate"],
          ["compare", "Compare"],
          ["drafts", "Drafts"],
          ["deploy", "Deploy"],
        ].map(([value, label]) => (
          <button
            aria-pressed={surface === value}
            key={value}
            onClick={() => {
              setSurface(value);
              setResult(null);
              setError("");
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
      {surface === "audit" && (
        <nav aria-label="Matrix Copilot mode" className="matrix-copilot-modes">
          {MODES.map(([value, label]) => (
            <button
              aria-pressed={mode === value}
              key={value}
              onClick={() => setMode(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {!["drafts", "deploy"].includes(surface) && (
        <div className="matrix-copilot-query">
          <label htmlFor="matrix-copilot-question">
            {surface === "compare"
              ? `Compare simulated alternatives (${scenarioHistory.length} available)`
              : surface === "audit" && mode === "MATRIX_QUESTION"
                ? "Ask about the current matrix"
                : surface === "audit"
                  ? "Optional focus"
                  : "Matrix objective"}
          </label>
          <div>
            <input
              id="matrix-copilot-question"
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Create a lower-drawdown deployment."
              value={question}
            />
            <button disabled={loading} onClick={() => run()} type="button">
              {loading
                ? "Analyzing..."
                : surface === "simulate"
                  ? "Run Scenario"
                  : surface === "compare"
                    ? "Compare Scenarios"
                    : "Analyze Matrix"}
            </button>
          </div>
          <div className="matrix-copilot-prompts">
            {PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  setQuestion(prompt);
                  if (surface === "audit") setMode("MATRIX_QUESTION");
                }}
                type="button"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="engine-error">{error}</p>}
      {response && <HistoricalContextUsed context={response.historicalContextUsed} />}
      {result && surface !== "audit" && (
        <div className="matrix-advisor-labels">
          <span>ADVISORY ONLY</span>
          <span>NO CHANGES APPLIED</span>
          {comparison && (
            <span>{comparison.simulationMethod.replaceAll("_", " ")}</span>
          )}
        </div>
      )}
      {surface === "audit" && response && (
        <div className="matrix-copilot-result">
          <div className="matrix-copilot-score">
            <div>
              <span>Executive Summary</span>
              <p>{response.executiveSummary}</p>
            </div>
            <strong>{formatNumber(response.confidenceScore)}/100</strong>
          </div>
          {audit && (
            <div className="matrix-copilot-metrics">
              <Metric label="Coverage" value={`${formatNumber(audit.coveragePct)}%`} />
              <Metric
                label="Active cells"
                value={`${audit.activeCells}/${audit.totalCells}`}
              />
              <Metric label="Sit out" value={formatNumber(audit.sitOutCells)} />
              <Metric label="Idle capital" value={`${formatNumber(audit.idleCapitalPct)}%`} />
              <Metric
                label="Guardrails"
                value={audit.guardrailsValid ? "PASS" : "REVIEW"}
              />
            </div>
          )}
          <div className="matrix-copilot-columns">
            <section>
              <h3>Key Findings</h3>
              <List values={response.keyFindings} />
            </section>
            <section>
              <h3>Risks</h3>
              <List values={response.risks} />
            </section>
          </div>
          <section>
            <h3>Cell Breakdown</h3>
            <div className="matrix-copilot-cells">
              {(response.cellAnalysis || []).map((cell) => (
                <article key={cell.cellKey}>
                  <strong>{cell.strategy || "Sit out"}</strong>
                  <p>{cell.finding}</p>
                </article>
              ))}
            </div>
          </section>
          <section>
            <h3>Evidence</h3>
            <div className="matrix-copilot-evidence">
              {(response.evidence || []).map((item) => (
                <article key={`${item.sourceType}-${item.sourceId}-${item.metricName}`}>
                  <strong>{item.metricName}: {formatNumericValue(item.metricValue)}</strong>
                  <p>{item.interpretation}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
      {surface === "recommend" && response && (
        <div className="matrix-copilot-result">
          <div className="matrix-copilot-score">
            <div>
              <span>Recommendation</span>
              <p>{response.executiveSummary}</p>
              <strong>{response.recommendation}</strong>
            </div>
            <strong>{formatNumber(response.confidenceScore)}/100</strong>
          </div>
          <div className="matrix-copilot-columns">
            <section>
              <h3>Concern</h3>
              <p>{response.concern}</p>
            </section>
            <section>
              <h3>Expected Benefits</h3>
              <List values={response.expectedBenefits} />
            </section>
            <section>
              <h3>Potential Downsides</h3>
              <List values={response.potentialDownsides} />
            </section>
          </div>
        </div>
      )}
      {surface === "simulate" && proposal && response && (
        <div className="matrix-copilot-result">
          <div className="matrix-copilot-score">
            <div>
              <span>Proposal</span>
              <h3>{proposal.title}</h3>
              <p>{response.executiveSummary}</p>
            </div>
            <strong>{formatNumber(response.confidenceScore)}/100</strong>
          </div>
          <section>
            <h3>Visual Matrix Diff</h3>
            <div className="matrix-diff-list">
              {comparison?.matrixDiff.map((item) => (
                <article key={item.after.key}>
                  <strong>
                    {item.after.sector} · {item.after.regime}
                  </strong>
                  <p>
                    {item.before?.strategyName || "Sit out"} (
                    {formatNumber(item.before?.allocationPct || 0)}%)
                  </p>
                  <span>→</span>
                  <p>
                    {item.after.strategyName || "Sit out"} (
                    {formatNumber(item.after.allocationPct || 0)}%)
                  </p>
                </article>
              ))}
            </div>
          </section>
          <section>
            <h3>Replay Comparison</h3>
            <div className="matrix-comparison-grid">
              {[
                "totalReturnPct",
                "sharpe",
                "maxDrawdownPct",
                "completedTrades",
                "transactionCosts",
              ].map((metric) => (
                <article key={metric}>
                  <span>{metric.replaceAll(/([A-Z])/g, " $1")}</span>
                  <strong>
                    {formatNumericValue(comparison?.current.replay[metric] ?? "Unavailable")}
                  </strong>
                  <b>
                    → {formatNumericValue(comparison?.proposed.replay[metric] ?? "Unavailable")}
                  </b>
                </article>
              ))}
            </div>
          </section>
          <div className="matrix-review-actions">
            <button disabled={loading} onClick={saveDraft} type="button">
              Save Draft
            </button>
            <button
              onClick={() => setQuestion(proposal.objective)}
              type="button"
            >
              Edit Request
            </button>
            <button
              onClick={() => {
                setResult(null);
                setQuestion("");
              }}
              type="button"
            >
              Discard
            </button>
          </div>
        </div>
      )}
      {surface === "compare" && response && (
        <div className="matrix-copilot-result">
          <div className="matrix-ranking-list">
            {response.rankings.map((item, index) => (
              <article key={`${item.proposalIndex}-${index}`}>
                <b>#{index + 1}</b>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.rationale}</p>
                  <small>
                    {item.implementationComplexity} complexity ·{" "}
                    {item.evidenceQuality} evidence · {formatNumber(item.confidenceScore)}/100
                  </small>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {["drafts", "deploy"].includes(surface) && (
        <div className="matrix-copilot-result">
          <div className="matrix-draft-list">
            {drafts
              .filter(
                (draft) =>
                  surface === "drafts" ||
                  (!draft.deletedAt && draft.status === "DRAFT"),
              )
              .map((draft) => (
                <article
                  className={selectedDraft?.id === draft.id ? "selected" : ""}
                  key={draft.id}
                >
                  <button onClick={() => setSelectedDraft(draft)} type="button">
                    <span>{draft.status}</span>
                    <strong>{draft.title}</strong>
                    <small>
                      {formatNumber(draft.confidence ?? 0)}/100 ·{" "}
                      {new Date(draft.createdAt).toLocaleString()}
                    </small>
                  </button>
                  <div>
                    {draft.deletedAt ? (
                      <button
                        onClick={() => draftAction(draft, "restore")}
                        type="button"
                      >
                        Restore
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => draftAction(draft, "duplicate")}
                          type="button"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => draftAction(draft, "delete")}
                          type="button"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
          </div>
            {selectedDraft && (
              <section className="matrix-draft-review">
                <h3>{selectedDraft.title}</h3>
                <p>{selectedDraft.objective}</p>
                <div className="matrix-advisor-labels">
                  <span>{selectedDraft.status}</span>
                  <span>{selectedDraft.simulationJson?.simulationMethod?.replaceAll("_", " ") || "VALIDATED SCENARIO"}</span>
                </div>
                <div className="matrix-diff-list">
                  {(selectedDraft.simulationJson?.matrixDiff || []).map((item) => (
                    <article key={item.after.key}>
                      <strong>{item.after.sector} · {item.after.regime}</strong>
                      <p>{item.before?.strategyName || "Sit out"} ({formatNumber(item.before?.allocationPct || 0)}%)</p>
                      <span>→</span>
                      <p>{item.after.strategyName || "Sit out"} ({formatNumber(item.after.allocationPct || 0)}%)</p>
                    </article>
                  ))}
                </div>
                <List
                values={selectedDraft.explanationJson?.risksTradeoffs || []}
                empty="No recorded trade-offs."
              />
              {surface === "drafts" &&
                !selectedDraft.deletedAt &&
                selectedDraft.status === "DRAFT" && (
                  <button
                    onClick={() => {
                      const title = window.prompt(
                        "Rename proposal",
                        selectedDraft.title,
                      );
                      if (title)
                        draftAction(selectedDraft, "rename", { title });
                    }}
                    type="button"
                  >
                    Rename
                  </button>
                )}
              {surface === "deploy" && selectedDraft.status === "DRAFT" && (
                <div className="matrix-review-actions">
                  <button
                    className="primary"
                    disabled={loading}
                    onClick={() =>
                      draftAction(selectedDraft, "approve", {
                        reason: "Explicit approval from Matrix Copilot review",
                      })
                    }
                    type="button"
                  >
                    Approve through Deployment Workflow
                  </button>
                  <button
                    disabled={loading}
                    onClick={() =>
                      draftAction(selectedDraft, "reject", {
                        reason: "Rejected during Matrix Copilot review",
                      })
                    }
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
