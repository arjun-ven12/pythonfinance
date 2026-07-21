import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronDown,
  Database,
  EyeOff,
  FileDown,
  GitBranch,
  Info,
  Layers,
  Link2,
  List,
  Plus,
  Radar,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserMinus,
  X,
} from "lucide-react";
import { API_BASE_URL, apiFetch } from "../../services/apiClient";
import "./memoryPersonalization.css";

const COPILOTS = [
  { field: "globalMode", name: "All memory", desc: "Global default applied unless a module overrides it below.", icon: Layers },
  { field: "strategyMode", name: "Strategy", desc: "Backtests, factor research, signal generation.", icon: TrendingUp },
  { field: "portfolioMode", name: "Portfolio", desc: "Position sizing, rebalancing, risk budgeting.", icon: ShieldCheck },
  { field: "matrixMode", name: "Matrix", desc: "Cross-asset allocation and regime conditioning.", icon: Layers },
  { field: "researchMode", name: "Research", desc: "Scanner output, screening, opportunity notes.", icon: Radar },
];

const ACCESS_LEVELS = [
  { value: "off", label: "Memory off", tone: "low", hint: "No memory context applied" },
  { value: "evidence", label: "Evidence only", tone: "teal", hint: "Only confirmed, sourced facts" },
  { value: "inferred", label: "Evidence + inferred", tone: "amber", hint: "Includes soft behavioral signals" },
  { value: "full", label: "Full personalization", tone: "blue", hint: "Broadest context, least constrained" },
];

const LEFT_POSITIONS = [
  { x: 150, y: 105 }, { x: 100, y: 230 }, { x: 150, y: 355 }, { x: 300, y: 400 },
  { x: 335, y: 85 }, { x: 360, y: 325 }, { x: 70, y: 390 }, { x: 80, y: 75 },
];
const RIGHT_POSITIONS = [
  { x: 750, y: 105 }, { x: 800, y: 230 }, { x: 750, y: 355 }, { x: 600, y: 400 },
  { x: 565, y: 85 }, { x: 540, y: 325 }, { x: 830, y: 390 }, { x: 820, y: 75 },
];

async function request(path, options) {
  const response = await apiFetch(`${API_BASE_URL}${path}`, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Memory request failed.");
  return payload;
}

function relativeAge(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  return `${Math.floor(seconds / 2592000)}mo ago`;
}

function memoryType(memory) {
  const type = String(memory.eventType || "").toUpperCase();
  if (type.includes("OPPORTUNITY")) return "Opportunity";
  if (type.includes("SCAN")) return "Scanner run";
  return String(memory.category || "Memory").replaceAll("_", " ").toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

function normalizeMemory(memory) {
  return {
    ...memory,
    type: memoryType(memory),
    detail: memory.summary || "No additional detail was recorded.",
    age: relativeAge(memory.occurredAt || memory.createdAt),
    importance: Math.max(0, Math.min(100, Number(memory.importance) || 0)),
  };
}

function profileLabel(status) {
  const labels = {
    NO_PERSONALIZATION_DATA: "Developing",
    LIMITED_HISTORY: "Limited",
    DEVELOPING_PROFILE: "Developing",
    ESTABLISHED_PROFILE: "Established",
  };
  return labels[status] || String(status || "Developing").replaceAll("_", " ").toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

function uiLevel(mode, inferredRequiresReview) {
  if (mode === "OFF") return "off";
  if (mode === "EVIDENCE_ONLY") return "evidence";
  return inferredRequiresReview ? "inferred" : "full";
}

function apiMode(level) {
  if (level === "off") return "OFF";
  if (level === "evidence") return "EVIDENCE_ONLY";
  return "PERSONALIZATION_ALLOWED";
}

function Pill({ children, tone = "mid" }) {
  return <span className={`mai-pill ${tone}`}>{children}</span>;
}

function AccessSelect({ disabled, onChange, value }) {
  const current = ACCESS_LEVELS.find((option) => option.value === value) || ACCESS_LEVELS[0];
  return (
    <div className="mai-select-wrap">
      <div className="mai-select-control">
        <select aria-label="Memory access level" disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
          {ACCESS_LEVELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" size={14} />
      </div>
      <div className="mai-select-hint"><span className={`mai-tone-dot ${current.tone}`} />{current.hint}</div>
    </div>
  );
}

function ImportanceMeter({ value }) {
  const width = `${Math.max(0, Math.min(100, Math.round((value / 60) * 100)))}%`;
  return (
    <div className="mai-importance" aria-label={`Importance ${value}`}>
      <span className="mai-importance-track"><span className={value >= 50 ? "high" : ""} style={{ width }} /></span>
      <strong>{value}</strong>
    </div>
  );
}

function RowAction({ icon: Icon, label, onClick, red = false }) {
  return (
    <button className={`mai-row-action${red ? " danger" : ""}`} disabled={!onClick} onClick={onClick} title={label} type="button">
      <Icon size={12.5} /><span>{label}</span>
    </button>
  );
}

function StatCard({ accent, eyebrow, icon: Icon, sub, value }) {
  return (
    <article className="mai-stat">
      <header><span>{eyebrow}</span><Icon className={accent} size={14} /></header>
      <strong>{value}</strong>
      <small>{sub}</small>
    </article>
  );
}

function graphPosition(index, side) {
  const fixed = side === "right" ? RIGHT_POSITIONS : LEFT_POSITIONS;
  if (fixed[index]) return fixed[index];
  const hubX = side === "right" ? 650 : 250;
  const angle = ((index - fixed.length) * 0.82) + (side === "right" ? -1.1 : 2.05);
  const distance = 150 + ((index - fixed.length) % 3) * 20;
  return { x: hubX + Math.cos(angle) * distance, y: 230 + Math.sin(angle) * distance };
}

function buildGraph(memories) {
  const scanner = memories.filter((memory) => memory.type !== "Opportunity");
  const opportunities = memories.filter((memory) => memory.type === "Opportunity");
  const firstSymbol = memories.flatMap((memory) => memory.links || []).find((link) => link.entityType === "SYMBOL")?.entityId || "SUBJECT";
  const positions = {
    "hub-source": { x: 250, y: 230 },
    "hub-subject": { x: 650, y: 230 },
  };
  scanner.forEach((memory, index) => { positions[`m-${memory.id}`] = graphPosition(index, "left"); });
  opportunities.forEach((memory, index) => { positions[`m-${memory.id}`] = graphPosition(index, "right"); });
  const edges = [
    ...scanner.map((memory) => ["hub-source", `m-${memory.id}`]),
    ...opportunities.map((memory) => ["hub-subject", `m-${memory.id}`]),
    ["hub-source", "hub-subject", { dashed: true }],
  ];
  const buckets = new Map();
  memories.forEach((memory) => {
    const timestamp = new Date(memory.occurredAt || memory.createdAt).getTime();
    const bucket = memory.sourceId
      ? `${memory.sourceType || "EVENT"}:${memory.sourceId}`
      : Number.isFinite(timestamp) ? `TIME:${Math.floor(timestamp / 300000)}` : null;
    if (bucket == null) return;
    const values = buckets.get(bucket) || [];
    values.push(memory);
    buckets.set(bucket, values);
  });
  buckets.forEach((items) => {
    for (let index = 1; index < items.length; index += 1) edges.push([`m-${items[index - 1].id}`, `m-${items[index].id}`]);
  });
  return {
    positions,
    edges,
    hubs: [
      { id: "hub-source", label: "SCAN", name: "Scanner Engine", desc: "The research process that produced every scanner-run memory below." },
      { id: "hub-subject", label: String(firstSymbol).slice(0, 5).toUpperCase(), name: String(firstSymbol).toUpperCase(), desc: `The ticker every opportunity memory on the right was recorded against.` },
    ],
  };
}

function MemoryGraph({ graph, memories, onSelect, selectedId, visibleIds }) {
  const byId = Object.fromEntries(memories.map((memory) => [`m-${memory.id}`, memory]));
  const connected = useMemo(() => {
    if (!selectedId) return null;
    const values = new Set([selectedId]);
    graph.edges.forEach(([from, to]) => {
      if (from === selectedId) values.add(to);
      if (to === selectedId) values.add(from);
    });
    return values;
  }, [graph.edges, selectedId]);
  const isDimmed = (id) => {
    if (id.startsWith("m-") && !visibleIds.has(id.slice(2))) return true;
    return Boolean(connected && !connected.has(id));
  };

  return (
    <svg aria-label="Memory relationship graph" className="mai-graph" viewBox="0 0 900 460">
      {graph.edges.map(([from, to, options], index) => {
        const start = graph.positions[from];
        const end = graph.positions[to];
        if (!start || !end) return null;
        const active = connected?.has(from) && connected?.has(to);
        return <line className={active ? "active" : ""} key={`${from}-${to}-${index}`} opacity={isDimmed(from) || isDimmed(to) ? 0.15 : active ? 0.9 : 0.55} strokeDasharray={options?.dashed ? "4 4" : undefined} x1={start.x} x2={end.x} y1={start.y} y2={end.y} />;
      })}
      {Object.entries(graph.positions).map(([id, position]) => {
        const hub = graph.hubs.find((item) => item.id === id);
        const memory = byId[id];
        if (!hub && !memory) return null;
        const selected = id === selectedId;
        const radius = hub ? 27 : 10 + memory.importance * 0.13;
        const tone = hub ? "hub" : memory.type === "Opportunity" ? "opportunity" : "scanner";
        return (
          <g aria-label={hub ? `${hub.name} entity node` : `${memory.title} memory node`} className={`mai-node ${tone}`} key={id} onClick={() => onSelect(selected ? null : id)} onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) onSelect(selected ? null : id); }} opacity={isDimmed(id) ? 0.15 : 1} role="button" tabIndex="0">
            <circle className="mai-node-main" cx={position.x} cy={position.y} r={radius} />
            {selected ? <circle className="mai-node-ring" cx={position.x} cy={position.y} r={radius + 5} /> : null}
            <text className="mai-node-value" x={position.x} y={position.y + 3.5}>{hub ? hub.label : memory.importance}</text>
            <text className="mai-node-label" x={position.x} y={position.y + radius + 15}>{hub ? hub.name : memory.age}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PreferenceList({ busy, items, onAction }) {
  if (!items.length) return (
    <div className="mai-empty-inline"><ShieldCheck size={14} />No explicit preferences yet. Preferences you add here are used exactly as written and never overridden by inference.</div>
  );
  return (
    <div className="mai-preference-list">
      {items.map((item) => (
        <article key={item.id}>
          <div><Pill tone={item.source === "USER_EXPLICIT" ? "teal" : "amber"}>{item.source.replaceAll("_", " ")}</Pill><strong>{item.preferenceType}: {item.key}</strong><span>{JSON.stringify(item.value)} · {item.confidence}/100 confidence</span></div>
          {item.source !== "USER_EXPLICIT" && !["REJECTED", "DISABLED"].includes(item.status) ? <div><button disabled={busy} onClick={() => onAction(item.id, "confirm")} type="button">Confirm</button><button disabled={busy} onClick={() => onAction(item.id, "reject")} type="button">Reject</button></div> : null}
        </article>
      ))}
    </div>
  );
}

export default function MemoryPersonalizationWorkspace() {
  const [data, setData] = useState(null);
  const [memories, setMemories] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [viewMode, setViewMode] = useState("list");
  const [selectedNode, setSelectedNode] = useState(null);
  const [confirmDanger, setConfirmDanger] = useState(null);
  const [draft, setDraft] = useState({ preferenceType: "RISK", key: "", value: "" });

  async function load() {
    const [profile, events] = await Promise.all([
      request("/api/memory/personalization/profile"),
      request("/api/memory/events?pageSize=100"),
    ]);
    setData(profile);
    setMemories((events.events || []).map(normalizeMemory));
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      request("/api/memory/personalization/profile"),
      request("/api/memory/events?pageSize=100"),
    ]).then(([profile, events]) => {
      if (!active) return;
      setData(profile);
      setMemories((events.events || []).map(normalizeMemory));
    }).catch((loadError) => { if (active) setError(loadError.message); });
    return () => { active = false; };
  }, []);

  async function action(path, options = { method: "POST" }, { reload = true } = {}) {
    setBusy(true);
    setError("");
    try {
      const result = await request(path, options);
      if (reload) await load();
      return result;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => memories.filter((memory) => {
    const matchesType = typeFilter === "All" || memory.type === typeFilter;
    const needle = query.trim().toLowerCase();
    return matchesType && (!needle || memory.title.toLowerCase().includes(needle) || memory.detail.toLowerCase().includes(needle));
  }), [memories, query, typeFilter]);
  const visibleIds = useMemo(() => new Set(filtered.map((memory) => String(memory.id))), [filtered]);
  const graph = useMemo(() => buildGraph(memories), [memories]);
  const selectedMemory = selectedNode?.startsWith("m-") ? memories.find((memory) => `m-${memory.id}` === selectedNode) : null;
  const selectedHub = graph.hubs.find((hub) => hub.id === selectedNode) || null;
  const activePreferences = data?.preferences?.filter((item) => item.status === "ACTIVE") || [];
  const activePatterns = data?.patterns?.filter((item) => item.status === "ACTIVE") || [];
  const scannerCount = memories.filter((memory) => memory.type === "Scanner run").length;
  const opportunityCount = memories.filter((memory) => memory.type === "Opportunity").length;

  async function updateLevel(copilot, level) {
    const payload = { [copilot.field]: apiMode(level) };
    if (level === "inferred" || level === "full") payload.inferredRequiresReview = level === "inferred";
    await action("/api/memory/personalization/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function addPreference() {
    if (!draft.key.trim() || !draft.value.trim()) return setError("Preference key and value are required.");
    const created = await action("/api/memory/personalization/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, value: { target: draft.value } }),
    });
    if (created) setDraft((current) => ({ ...current, key: "", value: "" }));
  }

  async function exportMemory() {
    setError("");
    try {
      const payload = await request("/api/memory/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "quants-trade-memory-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function deleteMemory(memory) {
    const result = await action(`/api/memory/events/${memory.id}`, { method: "DELETE" }, { reload: false });
    if (!result) return;
    setMemories((items) => items.filter((item) => item.id !== memory.id));
    setData((current) => ({ ...current, memoryCount: Math.max(0, Number(current.memoryCount || 0) - 1) }));
    if (selectedNode === `m-${memory.id}`) setSelectedNode(null);
  }

  const dangerActions = [
    { id: "reset", icon: RotateCcw, label: "Reset inferred personalization", desc: "Clears behavioral inferences. Explicit preferences are kept.", run: () => action("/api/memory/personalization/reset") },
    { id: "remove", icon: UserMinus, label: "Remove personalized context", desc: "Copilots fall back to evidence-only until new context accrues.", run: () => action("/api/memory/personalization", { method: "DELETE" }) },
    { id: "delete", icon: ShieldAlert, label: "Delete eligible account memory", desc: "Permanently deletes memory not under legal or audit hold.", run: () => action("/api/memory/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation: "DELETE_MY_MEMORY" }) }) },
  ];

  if (!data) return <div className="memory-ai-panel mai-loading"><Database size={18} /><span>{error || "Loading memory profile..."}</span></div>;

  return (
    <div className="memory-ai-panel">
      <div className="mai-header">
        <div className="mai-title-wrap"><div className="mai-mark"><Database size={18} /></div><div><span className="mai-eyebrow blue">AI KNOWLEDGE LAYER</span><h1>Memory &amp; AI</h1><p>Inspect, correct, export, or disable the historical context used by each copilot.</p></div></div>
        <button className="mai-secondary-button" onClick={exportMemory} type="button"><FileDown size={13.5} />Export structured memory</button>
      </div>

      <div className="mai-stats">
        <StatCard accent="amber" eyebrow="PROFILE" icon={Sparkles} sub={`Version ${data.profile.version} · building baseline`} value={profileLabel(data.profile.status)} />
        <StatCard accent="blue" eyebrow="MEMORIES" icon={Database} sub={`${scannerCount} scanner, ${opportunityCount} opportunity type`} value={data.memoryCount} />
        <StatCard accent="mid" eyebrow="ACTIVE PREFERENCES" icon={ShieldCheck} sub={activePreferences.length ? "Confirmed and available" : "None set — add one below"} value={activePreferences.length} />
        <StatCard accent="mid" eyebrow="ACTIVE PATTERNS" icon={Radar} sub={activePatterns.length ? "Evidence-backed patterns" : "Not enough history yet"} value={activePatterns.length} />
      </div>

      <div className="mai-advisory"><Info size={14} /><span>Personalization is advisory context only. <em>Current evidence and deterministic validation always take precedence over anything stored here.</em></span></div>
      {error ? <div className="mai-error" role="alert">{error}</div> : null}

      <section className="mai-section mai-controls-section">
        <div className="mai-section-head"><h2>Copilot Controls</h2><span>PER-MODULE ACCESS LEVEL</span></div>
        <div className="mai-controls">
          {COPILOTS.map((copilot) => {
            const Icon = copilot.icon;
            return <div className={copilot.field === "globalMode" ? "global" : ""} key={copilot.field}><div className="mai-control-copy"><Icon size={15} /><div><strong>{copilot.name}</strong><span>{copilot.desc}</span></div></div><AccessSelect disabled={busy} onChange={(level) => updateLevel(copilot, level)} value={uiLevel(data.settings[copilot.field], data.settings.inferredRequiresReview)} /></div>;
          })}
        </div>
      </section>

      <section className="mai-section">
        <div className="mai-section-head"><h2>Preferences</h2><button className="mai-small-button" disabled={busy} onClick={() => action("/api/memory/personalization/rebuild")} type="button"><RotateCcw size={12} />Rebuild inferred profile</button></div>
        <PreferenceList busy={busy} items={data.preferences || []} onAction={(id, decision) => action(`/api/memory/personalization/preferences/${id}/${decision}`)} />
        <div className="mai-pref-form">
          <label><span>CATEGORY</span><input aria-label="Preference type" onChange={(event) => setDraft((current) => ({ ...current, preferenceType: event.target.value }))} value={draft.preferenceType} /></label>
          <label className="key"><span>KEY</span><input aria-label="Preference key" onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value }))} placeholder="PREFERRED_MAX_DRAWDOWN" value={draft.key} /></label>
          <label className="value"><span>VALUE</span><input aria-label="Preference value" onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))} placeholder="10" value={draft.value} /></label>
          <button className="mai-add-button" disabled={busy} onClick={addPreference} type="button"><Plus size={13} />Add preference</button>
        </div>
      </section>

      <section className="mai-section">
        <div className="mai-section-head"><h2>Observed Patterns</h2></div>
        {activePatterns.length ? <div className="mai-pattern-list">{activePatterns.map((pattern) => <article key={pattern.id}><Radar size={15} /><div><strong>{pattern.title}</strong><span>{pattern.description}</span></div><button onClick={() => action(`/api/memory/personalization/patterns/${pattern.id}/dispute`)} type="button">Mark incorrect</button></article>)}</div> : <div className="mai-empty-pattern"><Radar size={18} /><strong>No recurring patterns detected yet</strong><span>Patterns surface once the same behavior repeats across enough sessions. Nothing<br /> here is used until then.</span></div>}
      </section>

      <section className="mai-section mai-explorer-section">
        <div className="mai-explorer-head">
          <h2>Memory Explorer</h2>
          <div className="mai-explorer-tools">
            <label className="mai-search"><Search size={13} /><input aria-label="Search memory" onChange={(event) => setQuery(event.target.value)} placeholder="Search memory" value={query} /></label>
            {["All", "Scanner run", "Opportunity"].map((filter) => <button className={typeFilter === filter ? "active" : ""} key={filter} onClick={() => setTypeFilter(filter)} type="button">{filter}</button>)}
            <span className="mai-divider" />
            <div className="mai-view-toggle" role="tablist">
              <button aria-selected={viewMode === "list"} className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} role="tab" type="button"><List size={12.5} />List</button>
              <button aria-selected={viewMode === "node"} className={viewMode === "node" ? "active" : ""} onClick={() => setViewMode("node")} role="tab" type="button"><GitBranch size={12.5} />Node</button>
            </div>
          </div>
        </div>

        {viewMode === "list" ? (
          <div className="mai-memory-list">
            {!filtered.length ? <div className="mai-no-results">No memory matches this search.</div> : null}
            {filtered.map((memory) => <div className="mai-memory-row" key={memory.id}><div className="mai-memory-copy"><Pill tone={memory.type === "Opportunity" ? "amber" : "blue"}>{memory.type.toUpperCase()}</Pill><div><strong>{memory.title}</strong><span>{memory.detail}</span></div></div><div className="mai-memory-meta"><time>{memory.age}</time><ImportanceMeter value={memory.importance} /><div className="mai-row-actions"><RowAction icon={EyeOff} label="Exclude" onClick={() => action(`/api/memory/events/${memory.id}/exclude`)} /><RowAction icon={Archive} label="Archive" onClick={() => action(`/api/memory/events/${memory.id}/archive`)} /><RowAction icon={Trash2} label="Delete" onClick={() => deleteMemory(memory)} red /></div></div></div>)}
          </div>
        ) : (
          <div className="mai-node-view">
            <div className={`mai-graph-pane${selectedNode ? " selected" : ""}`}>
              <div className="mai-legend"><span><i className="scanner" />Scanner run</span><span><i className="opportunity" />Opportunity</span><span><Link2 size={11} />Click a node to trace its connections</span></div>
              <MemoryGraph graph={graph} memories={memories} onSelect={setSelectedNode} selectedId={selectedNode} visibleIds={visibleIds} />
            </div>
            {selectedNode ? <aside className="mai-node-detail"><div className="mai-node-detail-head"><Pill tone={selectedHub ? "mid" : selectedMemory?.type === "Opportunity" ? "amber" : "blue"}>{selectedHub ? "ENTITY" : selectedMemory?.type.toUpperCase()}</Pill><button aria-label="Close node detail" onClick={() => setSelectedNode(null)} type="button"><X size={14} /></button></div>{selectedHub ? <><h3>{selectedHub.name}</h3><p>{selectedHub.desc}</p></> : selectedMemory ? <><h3>{selectedMemory.title}</h3><p>{selectedMemory.detail}</p><dl><div><dt>RECORDED</dt><dd>{selectedMemory.age}</dd></div><div><dt>IMPORTANCE</dt><dd><ImportanceMeter value={selectedMemory.importance} /></dd></div></dl><div className="mai-node-actions"><RowAction icon={EyeOff} label="Exclude" onClick={() => action(`/api/memory/events/${selectedMemory.id}/exclude`)} /><RowAction icon={Archive} label="Archive" onClick={() => action(`/api/memory/events/${selectedMemory.id}/archive`)} /><RowAction icon={Trash2} label="Delete" onClick={() => deleteMemory(selectedMemory)} red /></div></> : null}</aside> : null}
          </div>
        )}
      </section>

      <section className="mai-danger-section">
        <div className="mai-danger-title"><AlertTriangle size={14} /><h2>Danger Zone</h2></div>
        <div className="mai-danger-list">
          {dangerActions.map((danger) => {
            const Icon = danger.icon;
            return <div className="mai-danger-row" key={danger.id}><div><Icon size={15} /><span><strong>{danger.label}</strong><small>{danger.desc}</small></span></div>{confirmDanger === danger.id ? <div className="mai-confirm"><span>Confirm?</span><button disabled={busy} onClick={async () => { await danger.run(); setConfirmDanger(null); }} type="button"><Check size={12} />Yes, proceed</button><button aria-label="Cancel destructive action" onClick={() => setConfirmDanger(null)} type="button"><X size={12} /></button></div> : <button disabled={busy} onClick={() => setConfirmDanger(danger.id)} type="button">{danger.label}</button>}</div>;
          })}
        </div>
      </section>
    </div>
  );
}
