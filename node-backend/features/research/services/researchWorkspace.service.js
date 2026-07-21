const { requireUserId } = require("../../../repositories/ownership");
const { normalizeResearchEvidenceReferences } = require("./researchEvidence.service");

const PROJECT_STATUSES = Object.freeze(["DRAFT", "ACTIVE", "MONITORING", "CLOSED", "ARCHIVED"]);
const REPORT_TYPES = Object.freeze(["MARKET_OVERVIEW", "SYMBOL_RESEARCH", "COMPANY_COMPARISON", "SECTOR_RESEARCH", "THEME_RESEARCH", "MACRO_RESEARCH", "PORTFOLIO_IMPACT", "STRATEGY_IMPACT", "MATRIX_IMPACT", "SCANNER_IMPACT", "THESIS_REVIEW", "CHANGE_SINCE_LAST_REPORT", "PROJECT_QA"]);

function inputError(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; return error; }
function bounded(value, max, label, required = false) { const text = String(value || "").trim(); if (required && !text) throw inputError(`${label} is required.`); if (text.length > max) throw inputError(`${label} must be ${max} characters or fewer.`); return text; }
function slugify(value) { return String(value || "research").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "research"; }
function pageValue(value, fallback, max) { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback; }
function projectWhere(userId, id) { return { id: String(id), userId: requireUserId(userId) }; }
function normalizedScore(value) { const parsed = Number(value); if (!Number.isFinite(parsed)) return 0; return Math.max(0, Math.min(100, Math.round(parsed > 0 && parsed <= 1 ? parsed * 100 : parsed))); }

function emptyReportOutput(output = {}) {
  return {
    executiveSummary: String(output.executiveSummary || ""), keyFindings: output.keyFindings || [], whyItMatters: output.whyItMatters || [], evidence: output.evidence || [],
    relationshipMap: { ...(output.relationshipMap || { nodes: [], edges: [] }), edges: (output.relationshipMap?.edges || []).map((edge) => ({ ...edge, confidence: normalizedScore(edge.confidence) })) }, report: output.report || {}, affectedSystems: output.affectedSystems || {},
    risksAlternativeInterpretations: output.risksAlternativeInterpretations || [], confidenceScore: normalizedScore(output.confidenceScore),
    dataFreshness: output.dataFreshness || {}, suggestedFollowUpQuestions: output.suggestedFollowUpQuestions || [], limitations: output.limitations || [],
    historicalContextUsed: output.historicalContextUsed || null,
  };
}

function createResearchWorkspaceService({ prisma, aiService, contextService, memoryIngestionService = null, now = () => new Date() }) {
  const dbRun = (operation) => prisma.run ? prisma.run(operation) : operation(prisma);

  async function requireProject(userId, id, options = {}) {
    const project = await dbRun((db) => db.researchProject.findFirst({ where: projectWhere(userId, id), ...options }));
    if (!project) throw inputError("Research project not found.", 404);
    return project;
  }

  async function listProjects(userId, query = {}) {
    const ownerId = requireUserId(userId); const page = pageValue(query.page, 1, 100000); const pageSize = pageValue(query.pageSize, 20, 50);
    const where = { userId: ownerId, ...(query.status ? { status: String(query.status).toUpperCase() } : {}) };
    const [items, total] = await Promise.all([dbRun((db) => db.researchProject.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, title: true, slug: true, researchType: true, status: true, description: true, scopeJson: true, archivedAt: true, createdAt: true, updatedAt: true, _count: { select: { reports: true, notes: true, theses: true } } } })), dbRun((db) => db.researchProject.count({ where }))]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async function createProject(userId, body = {}) {
    const ownerId = requireUserId(userId); const title = bounded(body.title || body.topic, 160, "Project title", true);
    const researchType = bounded(body.researchType || "THEME_RESEARCH", 60, "Research type", true);
    const description = bounded(body.description, 1200, "Description"); const scope = body.scope && typeof body.scope === "object" && !Array.isArray(body.scope) ? body.scope : { topic: body.topic || title };
    if (Buffer.byteLength(JSON.stringify(scope)) > 16_000) throw inputError("Project scope is too large.");
    let validatedSource = null; let sourceFreshness = null;
    if (body.sourceResponse) {
      const context = await contextService.build(ownerId, { workflow: "DEEP_RESEARCH", question: title, symbol: scope.symbol, symbols: scope.symbols, sector: scope.sector, theme: scope.theme || scope.topic || title });
      validatedSource = emptyReportOutput(body.sourceResponse); validatedSource.evidence = normalizeResearchEvidenceReferences(validatedSource.evidence, context.availableEvidence); sourceFreshness = body.sourceFreshness || context.freshness;
    }
    const baseSlug = slugify(title); let slug = baseSlug;
    const exists = await dbRun((db) => db.researchProject.findFirst({ where: { userId: ownerId, slug }, select: { id: true } }));
    if (exists) slug = `${baseSlug}-${Date.now().toString(36)}`;
    const project = await dbRun((db) => db.researchProject.create({ data: { userId: ownerId, title, slug, researchType, status: "DRAFT", description: description || null, scopeJson: scope } }));
    if (memoryIngestionService) { const { researchProjectEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordFromResearch(researchProjectEvent(project)); }
    if (validatedSource) {
      const savedReport = await persistReport(ownerId, project.id, body.sourceReportType || researchType, title, validatedSource, { freshness: sourceFreshness });
      return { ...project, savedReportId: savedReport.id };
    }
    return project;
  }

  async function updateProject(userId, id, body = {}) {
    const project = await requireProject(userId, id); const data = {};
    if (body.title !== undefined) data.title = bounded(body.title, 160, "Project title", true);
    if (body.description !== undefined) data.description = bounded(body.description, 1200, "Description") || null;
    if (body.scope !== undefined) { if (!body.scope || typeof body.scope !== "object" || Array.isArray(body.scope) || Buffer.byteLength(JSON.stringify(body.scope)) > 16_000) throw inputError("Project scope must be a bounded object."); data.scopeJson = body.scope; }
    if (body.status !== undefined) { const status = String(body.status).toUpperCase(); if (!PROJECT_STATUSES.includes(status)) throw inputError("Unsupported research project status."); data.status = status; data.archivedAt = status === "ARCHIVED" ? now() : null; }
    return dbRun((db) => db.researchProject.update({ where: { id: project.id }, data }));
  }

  async function listReports(userId, projectId, query = {}) {
    const project = await requireProject(userId, projectId); const page = pageValue(query.page, 1, 100000); const pageSize = pageValue(query.pageSize, 10, 25);
    const where = { projectId: project.id, userId: requireUserId(userId), ...(query.reportType ? { reportType: String(query.reportType).toUpperCase() } : {}) };
    const [items, total] = await Promise.all([dbRun((db) => db.researchReport.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })), dbRun((db) => db.researchReport.count({ where }))]);
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async function getProject(userId, id) {
    const project = await requireProject(userId, id, { include: { reports: { orderBy: { createdAt: "desc" }, take: 5 }, notes: { orderBy: { createdAt: "desc" }, take: 20 }, questions: { orderBy: { createdAt: "desc" }, take: 20 }, theses: { orderBy: { versionNumber: "desc" }, take: 5 } } });
    const events = [
      { id: `project:${project.id}`, type: "PROJECT_CREATED", at: project.createdAt, title: "Project created" },
      ...(project.archivedAt ? [{ id: `archive:${project.id}`, type: "PROJECT_ARCHIVED", at: project.archivedAt, title: "Project archived" }] : []),
      ...project.reports.map((item) => ({ id: `report:${item.id}`, type: item.reportType === "COMPANY_COMPARISON" ? "COMPARISON" : "REPORT", at: item.createdAt, title: `${item.title} · v${item.versionNumber}` })),
      ...project.notes.map((item) => ({ id: `note:${item.id}`, type: "USER_NOTE", at: item.createdAt, title: item.content.slice(0, 120) })),
      ...project.questions.map((item) => ({ id: `question:${item.id}`, type: "QUESTION", at: item.createdAt, title: item.question })),
      ...project.theses.map((item) => ({ id: `thesis:${item.id}`, type: "THESIS", at: item.createdAt, title: `${item.status} · v${item.versionNumber}` })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 50);
    return { ...project, timeline: events };
  }

  async function projectContext(userId, projectId, request = {}) {
    const project = await requireProject(userId, projectId, { include: { reports: { orderBy: { createdAt: "desc" }, take: 3 }, notes: { orderBy: { createdAt: "desc" }, take: 10 }, theses: { orderBy: { versionNumber: "desc" }, take: 1 } } });
    const scope = project.scopeJson || {};
    const current = await contextService.build(userId, { workflow: request.workflow || "DEEP_RESEARCH", question: request.question || project.title, symbol: scope.symbol, symbols: scope.symbols, sector: scope.sector, theme: scope.theme || scope.topic || project.title });
    const thesis = project.theses[0];
    const result = { ...current, workflow: request.aiWorkflow || "PROJECT_REPORT", projectContext: { project: { id: project.id, title: project.title, researchType: project.researchType, status: project.status, description: String(project.description || "").slice(0, 1200), scope: project.scopeJson }, priorReports: project.reports.map((item) => ({ id: item.id, reportType: item.reportType, versionNumber: item.versionNumber, executiveSummary: String(item.executiveSummary || "").slice(0, 1200), evidenceSnapshot: (Array.isArray(item.evidenceSnapshot) ? item.evidenceSnapshot : []).slice(0, 12).map((evidence) => ({ sourceType: evidence.sourceType, sourceId: evidence.sourceId, metricName: evidence.metricName, metricValue: evidence.metricValue, timestamp: evidence.timestamp, strength: evidence.strength })), confidence: item.confidence, dataFreshness: item.dataFreshness, createdAt: item.createdAt })), currentThesis: thesis ? { id: thesis.id, statement: String(thesis.statement || "").slice(0, 1200), status: thesis.status, confidence: thesis.confidence, unresolvedQuestions: (Array.isArray(thesis.unresolvedQuestions) ? thesis.unresolvedQuestions : []).slice(0, 10), versionNumber: thesis.versionNumber, createdAt: thesis.createdAt } : null, userAuthoredNotes: project.notes.map((item) => ({ id: item.id, label: "USER_AUTHORED_CONTEXT", content: String(item.content || "").slice(0, 800), createdAt: item.createdAt })) } };
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > 120_000) {
      result.projectContext.priorReports = result.projectContext.priorReports.slice(0, 2).map((item) => ({ ...item, evidenceSnapshot: item.evidenceSnapshot.slice(0, 6) }));
      result.projectContext.userAuthoredNotes = result.projectContext.userAuthoredNotes.slice(0, 5).map((item) => ({ ...item, content: item.content.slice(0, 400) }));
      result.limitations = [...(result.limitations || []), "Project history was compacted to the configured AI safety budget."];
    }
    return result;
  }

  async function persistReport(userId, projectId, reportType, title, output, metadata = {}) {
    const ownerId = requireUserId(userId); const project = await requireProject(ownerId, projectId); const type = String(reportType || project.researchType).toUpperCase();
    if (!REPORT_TYPES.includes(type)) throw inputError("Unsupported research report type.");
    const normalized = emptyReportOutput(output);
    const report = await dbRun((db) => db.$transaction(async (tx) => {
      const latest = await tx.researchReport.findFirst({ where: { projectId: project.id, reportType: type }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
      return tx.researchReport.create({ data: { projectId: project.id, userId: ownerId, reportType: type, title: bounded(title || project.title, 200, "Report title", true), executiveSummary: normalized.executiveSummary, structuredContent: normalized, evidenceSnapshot: normalized.evidence, confidence: normalized.confidenceScore, dataFreshness: metadata.freshness || normalized.dataFreshness, affectedEntities: normalized.affectedSystems, limitationsJson: normalized.limitations, promptTemplateId: "research-copilot.md", promptVersion: "v3", model: metadata.model || null, aiInvocationId: metadata.aiInvocationId || null, versionNumber: (latest?.versionNumber || 0) + 1 } });
    }));
    if (memoryIngestionService) { const { researchReportEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordFromResearch(researchReportEvent(report)); }
    return report;
  }

  async function generate(userId, projectId, body = {}, kind = "REPORT") {
    const method = kind === "QUESTION" ? "researchProjectQuestion" : kind === "CHANGE" ? "researchChangeAnalysis" : kind === "COMPARISON" ? "researchProjectComparison" : "researchProjectReport";
    const aiWorkflow = kind === "QUESTION" ? "PROJECT_QUESTION" : kind === "CHANGE" ? "CHANGE_ANALYSIS" : kind === "COMPARISON" ? "PROJECT_COMPARISON" : "PROJECT_REPORT";
    const context = await projectContext(userId, projectId, { question: bounded(body.question || body.prompt, 2000, "Research question") || undefined, workflow: kind === "COMPARISON" ? "COMPARISON_RESEARCH" : "DEEP_RESEARCH", aiWorkflow });
    const output = await aiService[method](userId, context); output.evidence = normalizeResearchEvidenceReferences(output.evidence, context.availableEvidence);
    const reportType = kind === "QUESTION" ? "PROJECT_QA" : kind === "CHANGE" ? "CHANGE_SINCE_LAST_REPORT" : kind === "COMPARISON" ? "COMPANY_COMPARISON" : body.reportType || context.projectContext.project.researchType;
    const report = await persistReport(userId, projectId, reportType, body.title || body.question || context.projectContext.project.title, output, { freshness: context.freshness });
    if (kind === "QUESTION") await dbRun((db) => db.researchQuestion.create({ data: { projectId: String(projectId), userId: requireUserId(userId), question: bounded(body.question, 2000, "Research question", true), answerReportId: report.id, status: "ANSWERED" } }));
    return report;
  }

  async function addNote(userId, projectId, body = {}) { const project = await requireProject(userId, projectId); return dbRun((db) => db.researchNote.create({ data: { projectId: project.id, userId: requireUserId(userId), content: bounded(body.content, 4000, "Note", true), noteType: "USER_NOTE" } })); }

  async function createThesis(userId, projectId, body = {}) {
    const ownerId = requireUserId(userId); const project = await requireProject(ownerId, projectId); const confidence = normalizedScore(body.confidence);
    const thesis = await dbRun((db) => db.$transaction(async (tx) => { const latest = await tx.researchThesis.findFirst({ where: { projectId: project.id }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } }); return tx.researchThesis.create({ data: { projectId: project.id, userId: ownerId, statement: bounded(body.statement, 1200, "Thesis statement", true), status: String(body.status || "ACTIVE").toUpperCase(), confidence, supportingEvidence: [], opposingEvidence: [], unresolvedQuestions: body.unresolvedQuestions || [], affectedEntities: body.affectedEntities || {}, versionNumber: (latest?.versionNumber || 0) + 1 } }); }));
    if (memoryIngestionService) { const { thesisUpdatedEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordFromResearch(thesisUpdatedEvent(thesis)); }
    return thesis;
  }

  async function reviewThesis(userId, projectId, body = {}) {
    const ownerId = requireUserId(userId); const context = await projectContext(ownerId, projectId, { question: body.question || "Review the current thesis using fresh evidence.", workflow: "DEEP_RESEARCH", aiWorkflow: "THESIS_REVIEW" });
    if (!context.projectContext.currentThesis) throw inputError("Create a thesis before requesting a review.", 409);
    const output = await aiService.researchThesisReview(ownerId, context);
    output.supportingEvidence = normalizeResearchEvidenceReferences(output.supportingEvidence, context.availableEvidence); output.opposingEvidence = normalizeResearchEvidenceReferences(output.opposingEvidence, context.availableEvidence);
    const latest = context.projectContext.currentThesis;
    const thesis = await dbRun((db) => db.researchThesis.create({ data: { projectId: String(projectId), userId: ownerId, statement: output.statement || latest.statement, status: output.outcome, confidence: normalizedScore(output.confidenceScore), supportingEvidence: output.supportingEvidence, opposingEvidence: output.opposingEvidence, unresolvedQuestions: output.unresolvedQuestions || [], affectedEntities: output.affectedEntities || {}, versionNumber: latest.versionNumber + 1 } }));
    if (memoryIngestionService) { const { thesisUpdatedEvent } = require("../../memory/services/memoryEvents"); await memoryIngestionService.recordFromResearch(thesisUpdatedEvent(thesis)); }
    return thesis;
  }

  return { addNote, archive: (userId, id) => updateProject(userId, id, { status: "ARCHIVED" }), changes: (userId, id, body) => generate(userId, id, body, "CHANGE"), compare: (userId, id, body) => generate(userId, id, body, "COMPARISON"), createProject, createThesis, generateReport: (userId, id, body) => generate(userId, id, body, "REPORT"), getProject, listProjects, listReports, question: (userId, id, body) => generate(userId, id, body, "QUESTION"), restore: (userId, id) => updateProject(userId, id, { status: "ACTIVE" }), reviewThesis, updateProject };
}

module.exports = { PROJECT_STATUSES, REPORT_TYPES, createResearchWorkspaceService, emptyReportOutput, slugify };
