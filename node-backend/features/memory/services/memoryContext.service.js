const { redactSensitive } = require("../../../services/redactionService");

const COPILOT_PROFILES = Object.freeze({
  STRATEGY: {
    categories: ["STRATEGY", "RESEARCH", "MATRIX", "TRADE", "APPROVAL", "AI"],
    featurePattern: /strategy/i,
  },
  PORTFOLIO: {
    categories: ["PORTFOLIO", "RISK", "TRADE", "BROKER", "APPROVAL", "AI"],
    featurePattern: /portfolio/i,
  },
  RESEARCH: {
    categories: ["RESEARCH", "SCANNER", "STRATEGY", "MATRIX", "PORTFOLIO", "AI"],
    featurePattern: /research|marketImpact|scannerImpact|themeResearch|companyResearch/i,
  },
  MATRIX: {
    categories: ["MATRIX", "STRATEGY", "RESEARCH", "PORTFOLIO", "APPROVAL", "AI"],
    featurePattern: /matrix/i,
  },
});

const EMPTY_NOTICE = "No relevant historical context available.";
const RESEARCH_FEATURE_PATTERN = /^(marketResearchOverview|symbolResearch|sectorResearch|scannerResearchExplanation|watchlistResearchSummary|upcomingEventsSummary|deepResearch|marketImpact|portfolioImpact|strategyImpact|matrixImpact|scannerImpact|comparisonResearch|themeResearch|companyResearch|researchProject|researchThesis|researchChange)/;

function estimateTokens(value) { return Math.max(1, Math.ceil(JSON.stringify(value).length / 4)); }

function createMemoryContextService({ retrievalService = null, personalizationService = null, logger = console } = {}) {
  let retrieval = retrievalService;
  let personalization = personalizationService;

  function itemFromRanked(item) {
    const memory = item.memory;
    const context = {
      memoryEventId: memory.id,
      title: String(redactSensitive(memory.title)).slice(0, 200),
      summary: String(redactSensitive(memory.summary)).slice(0, 1200),
      category: memory.category,
      eventType: memory.eventType,
      occurredAt: memory.occurredAt,
      importance: memory.importance,
      relevanceScore: Number(item.finalScore.toFixed(4)),
      outcomeStatus: item.outcomeStatus,
      linkedEntities: (memory.links || []).slice(0, 20).map((link) => ({ entityType: link.entityType, entityId: link.entityId, relationshipType: link.relationshipType })),
      provenance: { sourceType: memory.sourceType, sourceId: memory.sourceId, sourceVersion: memory.sourceVersion || null, confidence: memory.confidence },
      evidenceStrength: memory.importance >= 80 && (memory.confidence == null || memory.confidence >= 70) ? "HIGH" : memory.importance >= 50 ? "MEDIUM" : "LOW",
      whyRetrieved: item.whyRetrieved,
    };
    return { context, tokenEstimate: estimateTokens(context) };
  }

  function assemble(ranked, tokenBudget) {
    const items = [];
    let tokenEstimate = 0;
    for (const rankedItem of ranked) {
      const item = itemFromRanked(rankedItem);
      if (tokenEstimate + item.tokenEstimate > tokenBudget) continue;
      items.push(item.context);
      tokenEstimate += item.tokenEstimate;
    }
    return { items, tokenEstimate, omittedCount: Math.max(0, ranked.length - items.length), tokenBudget };
  }

  function setRetrievalService(service) {
    retrieval = service;
  }
  function setPersonalizationService(service) { personalization = service; }

  function profileForFeature(featureType) {
    if (RESEARCH_FEATURE_PATTERN.test(String(featureType || ""))) {
      return ["RESEARCH", COPILOT_PROFILES.RESEARCH];
    }
    return Object.entries(COPILOT_PROFILES).find(([, profile]) =>
      profile.featurePattern.test(String(featureType || ""))
    ) || null;
  }

  function queryFromPayload(featureType, payload = {}) {
    const values = [
      payload.question,
      payload.prompt,
      payload.objective,
      payload.topic,
      payload.symbol && `Symbol ${payload.symbol}`,
      payload.sector && `Sector ${payload.sector}`,
      payload.theme && `Theme ${payload.theme}`,
      payload.strategy?.name && `Strategy ${payload.strategy.name}`,
      payload.context?.strategy?.name && `Strategy ${payload.context.strategy.name}`,
      payload.leftStrategy?.name && `Strategy ${payload.leftStrategy.name}`,
      payload.rightStrategy?.name && `Strategy ${payload.rightStrategy.name}`,
      payload.workflow && `Workflow ${payload.workflow}`,
    ].filter(Boolean).map((value) => String(value).trim());
    return (values.join(". ") || `Relevant history for ${featureType}`).slice(0, 1200);
  }

  function modeForQuery(query, payload = {}) {
    const value = `${query} ${payload.workflow || ""}`.toLowerCase();
    if (/\bprefer|preference|usually choose\b/.test(value)) return "USER_PREFERENCES";
    if (/\btimeline|chronolog|what changed|how has .* changed\b/.test(value)) return "ENTITY_TIMELINE";
    if (/\bworked|performed|outcome|profit|loss|drawdown|accepted|rejected|tried|before|previous\b/.test(value)) return "PAST_OUTCOMES";
    return "RELEVANT_HISTORY";
  }

  function entityFiltersFromPayload(profileName, payload = {}) {
    const filters = [];
    const add = (entityType, entityId) => {
      if (!entityId) return;
      filters.push({ entityType, entityId: String(entityId).slice(0, 160) });
    };
    if (profileName === "STRATEGY") {
      add("STRATEGY", payload.strategy?.id);
      add("STRATEGY", payload.context?.strategy?.id);
      add("STRATEGY", payload.leftStrategy?.id);
      add("STRATEGY", payload.rightStrategy?.id);
      add("STRATEGY_VERSION", payload.strategy?.latestVersion?.id);
    }
    if (profileName === "MATRIX") add("MATRIX", payload.dashboard?.deploymentSetId || payload.deploymentSetId);
    if (profileName === "RESEARCH") add("RESEARCH_PROJECT", payload.project?.id || payload.projectId || payload.projectContext?.project?.id);
    return filters;
  }

  function promptMemory(item) {
    return {
      title: item.title,
      summary: item.summary,
      category: item.category,
      importance: item.importance,
      timestamp: item.occurredAt,
      linkedEntities: item.linkedEntities,
      outcome: item.outcomeStatus,
      confidence: item.provenance?.confidence ?? null,
      retrievalReason: item.whyRetrieved,
    };
  }

  function publicMemory(item) {
    return {
      title: item.title,
      category: item.category,
      date: item.occurredAt,
      importance: item.importance,
      outcome: item.outcomeStatus,
      confidence: item.provenance?.confidence ?? null,
      retrievalReason: item.whyRetrieved,
    };
  }

  function emptyContext(mode = "RELEVANT_HISTORY", status = "NO_RELEVANT_MEMORY") {
    return {
      status,
      mode,
      notice: EMPTY_NOTICE,
      memories: [],
      tokenEstimate: 0,
      omittedCount: 0,
    };
  }

  async function enrichCopilotPayload({ userId, featureType, payload = {}, tokenBudget = 1200 } = {}) {
    const profileEntry = profileForFeature(featureType);
    if (!profileEntry || !retrieval?.retrieve) {
      return { payload, historicalContextUsed: emptyContext("OFF") };
    }
    const [profileName, profile] = profileEntry;
    const query = queryFromPayload(featureType, payload);
    const mode = modeForQuery(query, payload);
    try {
      const personalized = personalization?.context
        ? await personalization.context(userId, profileName).catch(() => ({ status: "UNAVAILABLE", profileVersion: null, preferences: [], patterns: [], confidence: 0, limitations: ["Personalization was unavailable."] }))
        : { status: "EVIDENCE_ONLY", profileVersion: null, preferences: [], patterns: [], confidence: 0, limitations: [] };
      const result = await retrieval.retrieve(userId, {
        query,
        mode,
        categories: profile.categories,
        entityFilters: entityFiltersFromPayload(profileName, payload),
        tokenBudget,
        requestingFeature: featureType,
        personalizationSignals: [...personalized.preferences.map((item) => item.key), ...personalized.patterns.map((item) => item.title)],
      });
      const context = {
        status: result.retrievalStatus,
        mode,
        notice: result.memories.length ? "Historical context is supporting evidence, not a guaranteed causal explanation." : EMPTY_NOTICE,
        memories: result.memories.map(promptMemory),
        tokenEstimate: result.context?.tokenEstimate || 0,
        omittedCount: result.context?.omittedCount || 0,
      };
      if (result.auditId && retrieval.annotatePersonalization) {
        await retrieval.annotatePersonalization(userId, result.auditId, {
          profileVersion: personalized.profileVersion,
          preferenceIds: personalized.preferences.map((item) => item.id),
          patternIds: personalized.patterns.map((item) => item.id),
        }).catch(() => null);
      }
      return {
        payload: { ...payload, relevantHistoricalContext: context, relevantPersonalization: personalized },
        historicalContextUsed: { ...context, memories: result.memories.map(publicMemory), personalization: personalized },
      };
    } catch (error) {
      logger.warn?.("copilot_memory_context_unavailable", {
        featureType,
        category: error.code || "RETRIEVAL",
      });
      const context = emptyContext(mode, "MEMORY_UNAVAILABLE");
      return {
        payload: { ...payload, relevantHistoricalContext: context },
        historicalContextUsed: context,
      };
    }
  }

  return {
    assemble,
    enrichCopilotPayload,
    estimateTokens,
    itemFromRanked,
    profileForFeature,
    setPersonalizationService,
    setRetrievalService,
  };
}

module.exports = { COPILOT_PROFILES, EMPTY_NOTICE, createMemoryContextService, estimateTokens };
