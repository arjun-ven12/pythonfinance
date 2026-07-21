import "./HistoricalContextUsed.css";
import { formatNumber } from "../../utils/numberFormat";

function formatDate(value) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleDateString();
}

function reasons(value = []) {
  return Array.isArray(value) && value.length ? value.join(" · ") : "Relevant historical match";
}

export default function HistoricalContextUsed({ context }) {
  if (!context) return null;
  const memories = Array.isArray(context.memories) ? context.memories : [];
  const personalization = context.personalization || {};
  const preferences = Array.isArray(personalization.preferences) ? personalization.preferences : [];
  const patterns = Array.isArray(personalization.patterns) ? personalization.patterns : [];
  const contextCount = memories.length + preferences.length + patterns.length;
  return (
    <details className="historical-context-used">
      <summary>
        <span>Historical Context Used</span>
        <small>{contextCount ? `${contextCount} context signal${contextCount === 1 ? "" : "s"}` : "No relevant memory"}</small>
      </summary>
      <div className="historical-context-body">
        <p>{context.notice || "Historical context is supporting evidence and may be incomplete."}</p>
        {memories.length ? (
          <div className="historical-context-grid">
            {memories.map((memory, index) => (
              <article key={`${memory.title}-${memory.date}-${index}`}>
                <header><span>{String(memory.category || "MEMORY").replaceAll("_", " ")}</span><b>Importance {formatNumber(memory.importance, "N/A")}</b></header>
                <strong>{memory.title}</strong>
                <small>{formatDate(memory.date)} · Confidence {formatNumber(memory.confidence, "N/A")}</small>
                <p>{reasons(memory.retrievalReason)}</p>
              </article>
            ))}
          </div>
        ) : <p className="historical-context-empty">No relevant historical context available.</p>}
        {(preferences.length > 0 || patterns.length > 0) && (
          <div className="historical-context-personalization">
            <header>
              <strong>Personalization signals</strong>
              <small>Profile v{formatNumber(personalization.profileVersion ?? 0)} · Confidence {formatNumber(personalization.confidence ?? 0)}/100</small>
            </header>
            <p>These signals adjust context relevance only. Current evidence and deterministic validation take precedence.</p>
            <div className="historical-context-grid">
              {preferences.map((item) => (
                <article key={item.id || `${item.type}-${item.key}`}>
                  <header><span>{item.source === "USER_EXPLICIT" ? "Explicit preference" : "Inferred preference"}</span><b>{formatNumber(item.confidence ?? 0)}/100</b></header>
                  <strong>{String(item.key || item.type || "Preference").replaceAll("_", " ")}</strong>
                  <small>{formatNumber(item.evidenceCount ?? 0)} evidence · {formatNumber(item.contradictingEvidenceCount ?? 0)} contradictions</small>
                </article>
              ))}
              {patterns.map((item) => (
                <article key={item.id || item.title}>
                  <header><span>Observed pattern</span><b>{formatNumber(item.confidence ?? 0)}/100</b></header>
                  <strong>{item.title}</strong>
                  <small>{formatNumber(item.sampleSize ?? 0)} samples · {formatNumber(item.contradictingEvidenceCount ?? 0)} contradictions</small>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
