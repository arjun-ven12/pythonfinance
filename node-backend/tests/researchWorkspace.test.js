const test = require("node:test");
const assert = require("node:assert/strict");
const { createResearchWorkspaceService } = require("../features/research/services/researchWorkspace.service");

function storeHarness() {
  const rows = { projects: [], reports: [], notes: [], questions: [], theses: [] }; let sequence = 0;
  const stamp = () => new Date(`2026-07-11T00:${String(sequence++).padStart(2, "0")}:00Z`);
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => row[key] === value);
  const db = {
    researchProject: {
      findFirst: async ({ where, include, select }) => { const row = rows.projects.find((item) => matches(item, where)); if (!row) return null; if (select) return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]])); if (!include) return { ...row }; return { ...row, reports: rows.reports.filter((x) => x.projectId === row.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, include.reports?.take), notes: rows.notes.filter((x) => x.projectId === row.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, include.notes?.take), questions: rows.questions.filter((x) => x.projectId === row.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, include.questions?.take), theses: rows.theses.filter((x) => x.projectId === row.id).sort((a, b) => b.versionNumber - a.versionNumber).slice(0, include.theses?.take) }; },
      findMany: async ({ where, skip = 0, take = 20 }) => rows.projects.filter((x) => matches(x, where)).slice(skip, skip + take).map((x) => ({ ...x, _count: { reports: rows.reports.filter((r) => r.projectId === x.id).length, notes: rows.notes.filter((r) => r.projectId === x.id).length, theses: rows.theses.filter((r) => r.projectId === x.id).length } })), count: async ({ where }) => rows.projects.filter((x) => matches(x, where)).length,
      create: async ({ data }) => { const row = { id: `p-${sequence}`, ...data, archivedAt: null, createdAt: stamp(), updatedAt: stamp() }; rows.projects.push(row); return { ...row }; },
      update: async ({ where, data }) => { const row = rows.projects.find((x) => x.id === where.id); Object.assign(row, data, { updatedAt: stamp() }); return { ...row }; },
    },
    researchReport: {
      findFirst: async ({ where }) => rows.reports.filter((x) => matches(x, where)).sort((a, b) => b.versionNumber - a.versionNumber)[0] || null,
      findMany: async ({ where, skip = 0, take = 10 }) => rows.reports.filter((x) => matches(x, where)).sort((a, b) => b.createdAt - a.createdAt).slice(skip, skip + take), count: async ({ where }) => rows.reports.filter((x) => matches(x, where)).length,
      create: async ({ data }) => { const row = { id: `r-${sequence}`, ...data, createdAt: stamp() }; rows.reports.push(row); return { ...row }; },
    },
    researchNote: { create: async ({ data }) => { const row = { id: `n-${sequence}`, ...data, createdAt: stamp(), updatedAt: stamp() }; rows.notes.push(row); return { ...row }; } },
    researchQuestion: { create: async ({ data }) => { const row = { id: `q-${sequence}`, ...data, createdAt: stamp() }; rows.questions.push(row); return { ...row }; } },
    researchThesis: { findFirst: async ({ where }) => rows.theses.filter((x) => matches(x, where)).sort((a, b) => b.versionNumber - a.versionNumber)[0] || null, create: async ({ data }) => { const row = { id: `t-${sequence}`, ...data, createdAt: stamp() }; rows.theses.push(row); return { ...row }; } },
  };
  db.$transaction = async (fn) => fn(db);
  const evidence = { sourceType: "MARKET_DATA", sourceId: "feed:NVDA", sourceName: "Market feed", sourceQuality: "HIGH", symbol: "NVDA", sector: "Technology", theme: "", metricName: "LastPrice", metricValue: "100", timestamp: "2026-07-11T00:00:00Z", dateRange: "", interpretation: "Current price.", strength: "HIGH", relevanceScore: 90 };
  const output = { executiveSummary: "Evidence-backed report.", keyFindings: [], whyItMatters: [], evidence: [evidence], relationshipMap: { nodes: [], edges: [] }, report: {}, affectedSystems: { portfolio: [], strategies: [], matrix: [], scanner: [], watchlist: [] }, risksAlternativeInterpretations: [], confidenceScore: 80, dataFreshness: {}, suggestedFollowUpQuestions: [], limitations: [] };
  const aiService = { researchProjectReport: async () => structuredClone(output), researchProjectQuestion: async () => structuredClone(output), researchChangeAnalysis: async () => structuredClone(output), researchProjectComparison: async () => structuredClone(output), researchThesisReview: async () => ({ outcome: "THESIS_STRENGTHENED", statement: "AI demand remains durable.", confidenceScore: 75, reasoning: ["Current evidence supports it."], supportingEvidence: [evidence], opposingEvidence: [], unresolvedQuestions: ["Spending duration"], affectedEntities: { symbols: ["NVDA"], sectors: ["Technology"], themes: ["AI"], strategies: [], matrixCells: [] }, limitations: [] }) };
  const contextService = { build: async (_userId, request) => ({ workflow: request.workflow, availableEvidence: [evidence], freshness: { marketDataTimestamp: evidence.timestamp, staleSources: [] } }) };
  return { rows, service: createResearchWorkspaceService({ prisma: { run: (fn) => fn(db) }, aiService, contextService, now: stamp }) };
}

test("research projects are created, paginated, lifecycle-managed, and owner isolated", async () => {
  const { service } = storeHarness(); const project = await service.createProject("u-1", { title: "AI Infrastructure", scope: { theme: "AI" } });
  assert.equal((await service.listProjects("u-1", { pageSize: 10 })).items.length, 1); assert.equal((await service.listProjects("u-2", {})).items.length, 0);
  await assert.rejects(service.getProject("u-2", project.id), /not found/i); assert.equal((await service.archive("u-1", project.id)).status, "ARCHIVED"); assert.equal((await service.restore("u-1", project.id)).status, "ACTIVE");
});

test("generated reports preserve immutable evidence snapshots and increment versions", async () => {
  const { service } = storeHarness(); const project = await service.createProject("u-1", { title: "Semiconductors", researchType: "THEME_RESEARCH", scope: { theme: "Semiconductors" } });
  const first = await service.generateReport("u-1", project.id, { reportType: "THEME_RESEARCH" }); const second = await service.generateReport("u-1", project.id, { reportType: "THEME_RESEARCH" });
  assert.equal(first.versionNumber, 1); assert.equal(second.versionNumber, 2); assert.equal(first.evidenceSnapshot[0].metricValue, "100");
  assert.equal((await service.listReports("u-1", project.id, { pageSize: 1 })).items.length, 1);
});

test("an existing copilot response is saved only after its evidence is revalidated", async () => {
  const { service, rows } = storeHarness();
  const sourceResponse = { executiveSummary: "Saved live research.", evidence: [{ sourceType: "MARKET_DATA", sourceId: "feed:NVDA", metricName: "LastPrice", metricValue: "100" }], confidenceScore: 70, affectedSystems: {}, limitations: [] };
  const project = await service.createProject("u-1", { title: "Saved NVDA Research", researchType: "SYMBOL_RESEARCH", scope: { symbol: "NVDA" }, sourceResponse, sourceReportType: "SYMBOL_RESEARCH" });
  assert.ok(project.savedReportId); assert.equal(rows.reports[0].evidenceSnapshot[0].sourceName, "Market feed");
  await assert.rejects(service.createProject("u-1", { title: "Invented", researchType: "SYMBOL_RESEARCH", scope: { symbol: "NVDA" }, sourceResponse: { ...sourceResponse, evidence: [{ sourceType: "NEWS", sourceId: "fake", metricName: "Headline", metricValue: "Invented" }] } }), /unavailable or mismatched/i);
});

test("project context keeps user notes distinct and follow-up questions create saved answer reports", async () => {
  const { service, rows } = storeHarness(); const project = await service.createProject("u-1", { title: "Rates", scope: { topic: "Rates" } }); await service.addNote("u-1", project.id, { content: "My concern is duration exposure." });
  await service.question("u-1", project.id, { question: "What changed?" }); assert.equal(rows.notes[0].noteType, "USER_NOTE"); assert.equal(rows.questions[0].status, "ANSWERED"); assert.equal(rows.reports[0].reportType, "PROJECT_QA");
});

test("thesis review creates a new evidence-backed thesis version and timeline", async () => {
  const { service } = storeHarness(); const project = await service.createProject("u-1", { title: "AI Thesis", scope: { symbol: "NVDA" } });
  await service.createThesis("u-1", project.id, { statement: "AI demand remains durable.", confidence: 60 }); const reviewed = await service.reviewThesis("u-1", project.id, {});
  assert.equal(reviewed.versionNumber, 2); assert.equal(reviewed.status, "THESIS_STRENGTHENED"); assert.equal(reviewed.supportingEvidence[0].sourceId, "feed:NVDA");
  assert.ok((await service.getProject("u-1", project.id)).timeline.some((item) => item.type === "THESIS"));
});
