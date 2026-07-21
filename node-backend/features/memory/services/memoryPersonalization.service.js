const { requireUserId } = require("../../../repositories/ownership");

const MODES = Object.freeze(["OFF", "EVIDENCE_ONLY", "PERSONALIZATION_ALLOWED"]);
const SOURCES = Object.freeze(["USER_EXPLICIT", "ACCEPTED_PROPOSALS", "REJECTED_PROPOSALS", "MANUAL_OVERRIDES", "HISTORICAL_OUTCOMES", "REPEATED_BEHAVIOR", "USER_FEEDBACK", "ADMIN_DEFINED_DEFAULT"]);
const STATUSES = Object.freeze(["CANDIDATE", "LOW_CONFIDENCE", "ACTIVE", "DISPUTED", "REJECTED", "STALE", "SUPERSEDED", "DISABLED"]);
const COPILOT_FIELDS = Object.freeze({ STRATEGY: "strategyMode", PORTFOLIO: "portfolioMode", MATRIX: "matrixMode", RESEARCH: "researchMode" });

function inputError(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; error.code = "MEMORY_PERSONALIZATION_VALIDATION"; return error; }
function score(value) { return Math.max(0, Math.min(100, Math.round(Number(value) || 0))); }
function statusFor(sampleSize, confidence, config) { if (sampleSize < config.minimumPreferenceEvidence) return "CANDIDATE"; return confidence >= config.minimumActiveConfidence ? "ACTIVE" : "LOW_CONFIDENCE"; }
function coldStartStatus(count) { if (count === 0) return "NO_PERSONALIZATION_DATA"; if (count < 5) return "LIMITED_HISTORY"; if (count < 20) return "DEVELOPING_PROFILE"; return "ESTABLISHED_PROFILE"; }
function isStale(item, config, nowValue = new Date()) { if (!item?.lastObservedAt || item.source === "USER_EXPLICIT") return false; return nowValue.getTime() - new Date(item.lastObservedAt).getTime() > config.staleAfterDays * 86_400_000; }
function withinTokenBudget(items, tokenBudget) { let used = 0; return items.filter((item) => { const estimate = Math.ceil(JSON.stringify(item).length / 4); if (used + estimate > tokenBudget) return false; used += estimate; return true; }); }
function preferenceSignal(memory) {
  const text = `${memory.title} ${memory.summary} ${JSON.stringify(memory.structuredData || {})}`.toLowerCase();
  const accepted = /approved|accepted/.test(memory.eventType.toLowerCase());
  const rejected = /rejected/.test(memory.eventType.toLowerCase());
  if (!accepted && !rejected) return null;
  const decisions = [
    [/drawdown|defensive|lower risk|reduce risk/, "RISK", "LOWER_DRAWDOWN"],
    [/turnover|trade frequency/, "RISK", "LOWER_TURNOVER"],
    [/cash/, "PORTFOLIO", "CASH_BUFFER"],
    [/sit out/, "MATRIX", "SIT_OUT"],
    [/momentum/, "STRATEGY", "MOMENTUM"],
  ];
  const match = decisions.find(([pattern]) => pattern.test(text));
  return match ? { preferenceType: match[1], key: match[2], accepted, rejected } : null;
}

function createMemoryPersonalizationService({ prisma, config, embeddingService = null, now = () => new Date() } = {}) {
  const dbRun = (operation) => prisma.run ? prisma.run(operation) : operation(prisma);
  const metrics = { contextRequests: 0, contextFailures: 0, optOuts: 0, rebuilds: 0, rebuildFailures: 0, exports: 0, resets: 0, deletions: 0 };
  async function settings(userId) { const ownerId = requireUserId(userId); return dbRun((db) => db.memoryPersonalizationSetting.upsert({ where: { userId: ownerId }, create: { userId: ownerId }, update: {} })); }
  async function updateSettings(userId, body = {}) { const ownerId = requireUserId(userId); const data = {}; for (const field of ["globalMode", ...Object.values(COPILOT_FIELDS)]) { if (body[field] !== undefined) { const value = String(body[field]).toUpperCase(); if (!MODES.includes(value)) throw inputError(`Unsupported ${field}.`); data[field] = value; } } if (body.inferredRequiresReview !== undefined) data.inferredRequiresReview = Boolean(body.inferredRequiresReview); return dbRun((db) => db.memoryPersonalizationSetting.upsert({ where: { userId: ownerId }, create: { userId: ownerId, ...data }, update: data })); }
  async function createExplicitPreference(userId, body = {}) { const ownerId = requireUserId(userId); const preferenceType = String(body.preferenceType || "").toUpperCase(); const key = String(body.key || "").trim().toUpperCase(); if (!preferenceType || !key || body.value === undefined) throw inputError("preferenceType, key, and value are required."); const timestamp = now(); return dbRun((db) => db.$transaction(async (tx) => { await tx.userPreference.updateMany({ where: { userId: ownerId, preferenceType, key, status: { in: ["ACTIVE", "CANDIDATE", "LOW_CONFIDENCE"] } }, data: { status: "SUPERSEDED" } }); return tx.userPreference.create({ data: { userId: ownerId, preferenceType, key, value: body.value, confidence: 100, evidenceCount: 1, evidenceIds: [], contradictingIds: [], source: "USER_EXPLICIT", status: "ACTIVE", firstObservedAt: timestamp, lastObservedAt: timestamp, confirmedAt: timestamp } }); })); }
  async function decidePreference(userId, id, action, body = {}) { const ownerId = requireUserId(userId); const existing = await dbRun((db) => db.userPreference.findFirst({ where: { id: String(id), userId: ownerId } })); if (!existing) throw inputError("Preference not found.", 404); const next = String(action).toUpperCase(); const data = next === "CONFIRM" ? { status: "ACTIVE", confirmedAt: now(), confidence: Math.max(90, existing.confidence) } : next === "REJECT" ? { status: "REJECTED" } : next === "DISABLE" ? { status: "DISABLED" } : null; if (!data) throw inputError("Unsupported preference action."); if (body.value !== undefined && existing.source === "USER_EXPLICIT") data.value = body.value; return dbRun((db) => db.userPreference.update({ where: { id: existing.id }, data })); }
  async function decidePattern(userId, id, action) { const ownerId = requireUserId(userId); const existing = await dbRun((db) => db.userBehaviorPattern.findFirst({ where: { id: String(id), userId: ownerId } })); if (!existing) throw inputError("Pattern not found.", 404); const status = String(action).toUpperCase() === "REJECT" ? "REJECTED" : String(action).toUpperCase() === "DISPUTE" ? "DISPUTED" : null; if (!status) throw inputError("Unsupported pattern action."); return dbRun((db) => db.userBehaviorPattern.update({ where: { id: existing.id }, data: { status } })); }
  async function rebuild(userId) {
    const ownerId = requireUserId(userId); const started = Date.now();
    const memories = await dbRun((db) => db.memoryEvent.findMany({ where: { userId: ownerId, retentionState: "ACTIVE", excludedFromAi: false, eventType: { in: ["AI_RECOMMENDATION_ACCEPTED", "AI_RECOMMENDATION_REJECTED", "PORTFOLIO_PROPOSAL_APPROVED", "PORTFOLIO_PROPOSAL_REJECTED", "MATRIX_PROPOSAL_APPROVED", "MATRIX_PROPOSAL_REJECTED", "MANUAL_OVERRIDE"] } }, orderBy: { occurredAt: "asc" }, take: 2000 }));
    const groups = new Map();
    for (const memory of memories) { const signal = preferenceSignal(memory); if (!signal) continue; const key = `${signal.preferenceType}:${signal.key}`; const group = groups.get(key) || { ...signal, supporting: [], contradicting: [] }; (signal.accepted ? group.supporting : group.contradicting).push(memory); groups.set(key, group); }
    const inferred = [...groups.values()].map((group) => { const sampleSize = group.supporting.length + group.contradicting.length; const ratio = Math.max(group.supporting.length, group.contradicting.length) / sampleSize; const confidence = score(35 + ratio * 55 + Math.min(10, sampleSize)); const supports = group.supporting.length >= group.contradicting.length ? group.supporting : group.contradicting; const contradicts = group.supporting.length >= group.contradicting.length ? group.contradicting : group.supporting; return { ...group, sampleSize, confidence, supports, contradicts, preferred: group.supporting.length >= group.contradicting.length }; });
    return dbRun((db) => db.$transaction(async (tx) => {
      await tx.userPreference.updateMany({ where: { userId: ownerId, source: { not: "USER_EXPLICIT" }, status: { notIn: ["REJECTED", "DISABLED"] } }, data: { status: "STALE" } });
      await tx.userBehaviorPattern.updateMany({ where: { userId: ownerId, status: { notIn: ["REJECTED", "DISPUTED"] } }, data: { status: "STALE" } });
      for (const item of inferred) {
        const dates = [...item.supports, ...item.contradicts].map((memory) => memory.occurredAt);
        const status = statusFor(item.sampleSize, item.confidence, config);
        await tx.userPreference.create({ data: { userId: ownerId, preferenceType: item.preferenceType, key: item.key, value: { preferred: item.preferred }, confidence: item.confidence, evidenceCount: item.sampleSize, evidenceIds: item.supports.map((memory) => memory.id), contradictingIds: item.contradicts.map((memory) => memory.id), source: item.preferred ? "ACCEPTED_PROPOSALS" : "REJECTED_PROPOSALS", status, firstObservedAt: dates[0], lastObservedAt: dates.at(-1) } });
        if (item.sampleSize >= config.minimumPatternEvidence) await tx.userBehaviorPattern.create({ data: { userId: ownerId, patternType: "DECISION_PATTERN", title: `${item.key.replaceAll("_", " ")} decision pattern`, description: `${item.supports.length} supporting and ${item.contradicts.length} contradicting decisions were observed. This is an association, not causation.`, structuredData: { extractionVersion: config.extractionVersion, preferred: item.preferred }, confidence: item.confidence, sampleSize: item.sampleSize, supportingMemoryIds: item.supports.map((memory) => memory.id), contradictingMemoryIds: item.contradicts.map((memory) => memory.id), firstObservedAt: dates[0], lastObservedAt: dates.at(-1), status } });
      }
      const latest = await tx.userMemoryProfile.findFirst({ where: { userId: ownerId }, orderBy: { version: "desc" } });
      const evidenceCount = memories.length; const status = coldStartStatus(evidenceCount); const confidence = inferred.length ? score(inferred.reduce((sum, item) => sum + item.confidence, 0) / inferred.length) : 0;
      const profile = await tx.userMemoryProfile.create({ data: { userId: ownerId, version: (latest?.version || 0) + 1, status, summary: inferred.length ? `${inferred.length} evidence-backed preference signals were extracted from ${evidenceCount} decision memories.` : "Insufficient evidence is available for inferred personalization.", evidenceCount, confidence } });
      return { profile, extractedPreferences: inferred.length, latencyMs: Date.now() - started };
    }));
  }
  async function profile(userId) { const ownerId = requireUserId(userId); const [current, preferences, patterns, control, memoryCount] = await dbRun((db) => Promise.all([db.userMemoryProfile.findFirst({ where: { userId: ownerId }, orderBy: { version: "desc" } }), db.userPreference.findMany({ where: { userId: ownerId }, orderBy: [{ source: "asc" }, { updatedAt: "desc" }] }), db.userBehaviorPattern.findMany({ where: { userId: ownerId }, orderBy: { updatedAt: "desc" } }), db.memoryPersonalizationSetting.upsert({ where: { userId: ownerId }, create: { userId: ownerId }, update: {} }), db.memoryEvent.count({ where: { userId: ownerId } })])); return { profile: current || { version: 0, status: coldStartStatus(memoryCount), summary: "No personalization profile has been built.", evidenceCount: memoryCount, confidence: 0 }, preferences, patterns, settings: control, memoryCount }; }
  async function context(userId, copilot) {
    const data = await profile(userId); const field = COPILOT_FIELDS[copilot]; const mode = data.settings.globalMode === "OFF" ? "OFF" : data.settings[field] || data.settings.globalMode;
    if (mode !== "PERSONALIZATION_ALLOWED") return { status: mode === "OFF" ? "DISABLED" : "EVIDENCE_ONLY", profileVersion: data.profile.version, preferences: [], patterns: [], confidence: 0, limitations: [mode === "OFF" ? "Memory use is disabled for this copilot." : "Personalization is not enabled for this copilot."] };
    const eligible = data.preferences.filter((item) => item.status === "ACTIVE" && !isStale(item, config, now()) && (item.source === "USER_EXPLICIT" || !data.settings.inferredRequiresReview || item.confirmedAt));
    const selected = new Map();
    for (const item of eligible.filter((entry) => entry.source === "USER_EXPLICIT")) selected.set(`${item.preferenceType}:${item.key}`, item);
    for (const item of eligible.filter((entry) => entry.source !== "USER_EXPLICIT")) if (!selected.has(`${item.preferenceType}:${item.key}`)) selected.set(`${item.preferenceType}:${item.key}`, item);
    const mappedPreferences = [...selected.values()].slice(0, 8).map((item) => ({ id: item.id, type: item.preferenceType, key: item.key, value: item.value, source: item.source, confidence: item.confidence, evidenceCount: item.evidenceCount, contradictingEvidenceCount: item.contradictingIds?.length || 0 }));
    const mappedPatterns = data.patterns.filter((item) => item.status === "ACTIVE" && !isStale(item, config, now())).slice(0, 6).map((item) => ({ id: item.id, title: item.title, description: item.description, confidence: item.confidence, sampleSize: item.sampleSize, contradictingEvidenceCount: item.contradictingMemoryIds?.length || 0 }));
    const bounded = withinTokenBudget([...mappedPreferences.map((item) => ({ kind: "preference", ...item })), ...mappedPatterns.map((item) => ({ kind: "pattern", ...item }))], config.maxContextTokens);
    const preferences = bounded.filter((item) => item.kind === "preference").map(({ kind, ...item }) => item); const patterns = bounded.filter((item) => item.kind === "pattern").map(({ kind, ...item }) => item);
    return { status: data.profile.status, profileVersion: data.profile.version, preferences, patterns, confidence: data.profile.confidence, limitations: [...(!preferences.length && !patterns.length ? ["Personalization is limited by confirmed, current evidence."] : []), ...(bounded.length < mappedPreferences.length + mappedPatterns.length ? ["Some personalization signals were omitted to respect the context budget."] : [])] };
  }
  async function reset(userId) { const ownerId = requireUserId(userId); return dbRun((db) => db.$transaction(async (tx) => { await tx.userPreference.deleteMany({ where: { userId: ownerId, source: { not: "USER_EXPLICIT" } } }); await tx.userBehaviorPattern.deleteMany({ where: { userId: ownerId } }); await tx.userMemoryProfile.deleteMany({ where: { userId: ownerId } }); return { reset: true }; })); }
  async function removePersonalizedContext(userId) { const ownerId = requireUserId(userId); return dbRun((db) => db.$transaction(async (tx) => { await tx.userPreference.deleteMany({ where: { userId: ownerId } }); await tx.userBehaviorPattern.deleteMany({ where: { userId: ownerId } }); await tx.userMemoryProfile.deleteMany({ where: { userId: ownerId } }); await tx.memoryPersonalizationSetting.upsert({ where: { userId: ownerId }, create: { userId: ownerId, globalMode: "OFF", strategyMode: "OFF", portfolioMode: "OFF", matrixMode: "OFF", researchMode: "OFF" }, update: { globalMode: "OFF", strategyMode: "OFF", portfolioMode: "OFF", matrixMode: "OFF", researchMode: "OFF" } }); return { removed: true, memoryEventsPreserved: true }; })); }
  async function exportData(userId) { const ownerId = requireUserId(userId); const [memories, data] = await Promise.all([dbRun((db) => db.memoryEvent.findMany({ where: { userId: ownerId }, include: { links: true, feedback: true }, orderBy: { occurredAt: "desc" } })), profile(ownerId)]); return { exportedAt: now(), memories, ...data }; }
  async function deleteEligibleMemory(userId, id) { const ownerId = requireUserId(userId); const memory = await dbRun((db) => db.memoryEvent.findFirst({ where: { id: String(id), userId: ownerId } })); if (!memory) throw inputError("Memory not found.", 404); if (["ORDER_FILLED", "ORDER_SUBMITTED", "TRADE_OPENED", "TRADE_CLOSED"].includes(memory.eventType)) throw inputError("Immutable trading audit memories cannot be deleted; exclude them from AI instead.", 409); await embeddingService?.excludeMemory(memory.id, ownerId).catch(() => null); await dbRun((db) => db.memoryEvent.delete({ where: { id: memory.id } })); return { deleted: true }; }
  async function deleteAccountMemory(userId, body = {}) {
    const ownerId = requireUserId(userId); if (body.confirmation !== "DELETE_MY_MEMORY") throw inputError("Account memory deletion requires confirmation.");
    const immutableTypes = ["ORDER_FILLED", "ORDER_SUBMITTED", "TRADE_OPENED", "TRADE_CLOSED"];
    const immutable = await dbRun((db) => db.memoryEvent.findMany({ where: { userId: ownerId, eventType: { in: immutableTypes } }, select: { id: true } }));
    const result = await dbRun((db) => db.$transaction(async (tx) => { const excluded = await tx.memoryEvent.updateMany({ where: { userId: ownerId, eventType: { in: immutableTypes } }, data: { excludedFromAi: true, retentionState: "EXCLUDED" } }); const deleted = await tx.memoryEvent.deleteMany({ where: { userId: ownerId, eventType: { notIn: immutableTypes } } }); await tx.userPreference.deleteMany({ where: { userId: ownerId } }); await tx.userBehaviorPattern.deleteMany({ where: { userId: ownerId } }); await tx.userMemoryProfile.deleteMany({ where: { userId: ownerId } }); await tx.memoryPersonalizationSetting.upsert({ where: { userId: ownerId }, create: { userId: ownerId, globalMode: "OFF" }, update: { globalMode: "OFF", strategyMode: "OFF", portfolioMode: "OFF", matrixMode: "OFF", researchMode: "OFF" } }); return { deleted: deleted.count, immutableAuditMemoriesExcluded: excluded.count }; }));
    await Promise.all(immutable.map((item) => embeddingService?.excludeMemory(item.id, ownerId).catch(() => null)));
    return result;
  }
  async function trackedContext(...args) { metrics.contextRequests += 1; try { const result = await context(...args); if (["DISABLED", "EVIDENCE_ONLY"].includes(result.status)) metrics.optOuts += 1; return result; } catch (error) { metrics.contextFailures += 1; throw error; } }
  async function trackedRebuild(...args) { try { const result = await rebuild(...args); metrics.rebuilds += 1; return result; } catch (error) { metrics.rebuildFailures += 1; throw error; } }
  async function trackedExport(...args) { const result = await exportData(...args); metrics.exports += 1; return result; }
  async function trackedReset(...args) { const result = await reset(...args); metrics.resets += 1; return result; }
  async function trackedDelete(...args) { const result = await deleteEligibleMemory(...args); metrics.deletions += 1; return result; }
  async function diagnostics() {
    const [profiles, preferences, patterns, controls] = await dbRun((db) => Promise.all([
      db.userMemoryProfile.count(), db.userPreference.groupBy({ by: ["source", "status"], _count: true }), db.userBehaviorPattern.groupBy({ by: ["status"], _count: true }), db.memoryPersonalizationSetting.groupBy({ by: ["globalMode"], _count: true }),
    ]));
    return { runtime: { ...metrics }, durable: { profiles, preferences, patterns, controls }, configuration: { minimumPreferenceEvidence: config.minimumPreferenceEvidence, minimumPatternEvidence: config.minimumPatternEvidence, minimumActiveConfidence: config.minimumActiveConfidence, staleAfterDays: config.staleAfterDays, maxContextTokens: config.maxContextTokens, extractionVersion: config.extractionVersion } };
  }
  return { context: trackedContext, createExplicitPreference, decidePattern, decidePreference, deleteAccountMemory, deleteEligibleMemory: trackedDelete, diagnostics, exportData: trackedExport, profile, rebuild: trackedRebuild, removePersonalizedContext, reset: trackedReset, settings, updateSettings };
}
module.exports = { COPILOT_FIELDS, MODES, SOURCES, STATUSES, coldStartStatus, createMemoryPersonalizationService, isStale, preferenceSignal, statusFor, withinTokenBudget };
