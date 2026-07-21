import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";
import {
  apiRequest,
  cancelRequestGroup,
  REQUEST_PRIORITY,
} from "../../../services/apiRequestManager";
import {
  serializeStrategyBuilderState,
  validateStrategyJson,
} from "../utils/strategyJsonContract";
import {
  buildStrategyCopilotDraftRequest,
  createStrategyCopilotPreferences,
  validateStrategyCopilotDraftRequest,
} from "../strategyCopilotPreferences";

export default function useStrategyLab({
  activeStrategyStorageKey,
  defaultParameterSweep,
  defaultStrategyExperiment,
  getUserStorageKey,
}) {
  const [strategyExperimentsData, setStrategyExperimentsData] = useState({ experiments: [] });
  const [strategyLabError, setStrategyLabError] = useState("");
  const [activeStrategyExperimentId, setActiveStrategyExperimentId] = useState(() =>
    localStorage.getItem(getUserStorageKey(activeStrategyStorageKey)) || ""
  );
  const [activeStrategyConfig, setActiveStrategyConfig] = useState(null);
  const [activeSetData, setActiveSetData] = useState(null);
  const [routingActionLoading, setRoutingActionLoading] = useState("");
  const [strategyExperimentForm, setStrategyExperimentForm] = useState(defaultStrategyExperiment);
  const [editingStrategyExperimentId, setEditingStrategyExperimentId] = useState("");
  const [selectedStrategyExperimentId, setSelectedStrategyExperimentId] = useState("");
  const [selectedStrategyRunId, setSelectedStrategyRunId] = useState("");
  const [runningStrategyExperimentId, setRunningStrategyExperimentId] = useState("");
  const [strategyRunSymbol, setStrategyRunSymbol] = useState("AAPL");
  const [strategyRunUniverseMode, setStrategyRunUniverseMode] = useState("SINGLE");
  const [strategyRunUniverseId, setStrategyRunUniverseId] = useState("");
  const [strategyRunTopN, setStrategyRunTopN] = useState("10");
  const [strategyRunPeriod, setStrategyRunPeriod] = useState("2y");
  const [parameterSweepConfig, setParameterSweepConfig] = useState(defaultParameterSweep);
  const [runningSweepExperimentId, setRunningSweepExperimentId] = useState("");
  const [runningRobustnessExperimentId, setRunningRobustnessExperimentId] = useState("");
  const [runningWalkForwardExperimentId, setRunningWalkForwardExperimentId] = useState("");
  const [runningRegimeExperimentId, setRunningRegimeExperimentId] = useState("");
  const [runningStressExperimentId, setRunningStressExperimentId] = useState("");
  const [walkForwardResult, setWalkForwardResult] = useState(null);
  const [regimeAnalysisResult, setRegimeAnalysisResult] = useState(null);
  const [stressResult, setStressResult] = useState(null);
  const [strategyLeaderboard, setStrategyLeaderboard] = useState(null);
  const [strategyLifecycleDashboard, setStrategyLifecycleDashboard] = useState(null);
  const [strategyMemory, setStrategyMemory] = useState(null);
  const [strategyPortfolioResult, setStrategyPortfolioResult] = useState(null);
  const [strategyMatrixReplayResult, setStrategyMatrixReplayResult] = useState(null);
  const [strategyDeploymentAllocation, setStrategyDeploymentAllocation] = useState(null);
  const [savingStrategyDeploymentAllocation, setSavingStrategyDeploymentAllocation] = useState(false);
  const [runningMatrixReplay, setRunningMatrixReplay] = useState(false);
  const [runningPortfolioSimulation, setRunningPortfolioSimulation] = useState(false);
  const [strategyPreview, setStrategyPreview] = useState({
    loading: false,
    error: "",
    result: null,
  });
  const [strategyCopilotPrompt, setStrategyCopilotPrompt] = useState("");
  const [strategyCopilotPreferences, setStrategyCopilotPreferences] = useState(
    createStrategyCopilotPreferences
  );
  const [strategyCopilotCompareTargetId, setStrategyCopilotCompareTargetId] = useState("");
  const [strategyCopilotCompareVersionId, setStrategyCopilotCompareVersionId] = useState("");
  const [strategyCopilotDraft, setStrategyCopilotDraft] = useState({
    loading: false,
    error: "",
    mode: "draft",
    result: null,
  });
  const previewRequestIdRef = useRef(0);
  const [strategySweepProgress, setStrategySweepProgress] = useState({
    percent: 0,
    label: "Idle",
  });

  const fetchStrategyExperiments = useCallback(async () => {
    try {
      const nextExperiments = await apiRequest(`${API_BASE_URL}/api/strategy-experiments`, {
        forceRefresh: true,
        priority: REQUEST_PRIORITY.MEDIUM,
      });
      const experiments = nextExperiments.experiments || [];
      setStrategyExperimentsData(nextExperiments);
      setStrategyLabError("");
      setSelectedStrategyExperimentId((current) => current || experiments[0]?.id || "");
      setSelectedStrategyRunId((current) => current || experiments[0]?.runs?.[0]?.id || "");
    } catch (err) {
      setStrategyExperimentsData({ experiments: [], error: err.message });
      setStrategyLabError(err.message);
    }
  }, []);

  const fetchActiveStrategy = useCallback(async () => {
    try {
      const nextActiveStrategy = await apiRequest(`${API_BASE_URL}/api/active-strategy`, {
        forceRefresh: true,
        priority: REQUEST_PRIORITY.MEDIUM,
      });
      setActiveStrategyConfig(nextActiveStrategy);
      setActiveSetData(nextActiveStrategy.activeSet || null);
      if (nextActiveStrategy.experimentId) {
        localStorage.setItem(
          getUserStorageKey(activeStrategyStorageKey),
          nextActiveStrategy.experimentId
        );
        setActiveStrategyExperimentId(nextActiveStrategy.experimentId);
      } else {
        localStorage.removeItem(getUserStorageKey(activeStrategyStorageKey));
        setActiveStrategyExperimentId("");
      }
      return nextActiveStrategy;
    } catch (err) {
      setStrategyLabError((current) => current || err.message);
      return null;
    }
  }, [activeStrategyStorageKey, getUserStorageKey]);

  const fetchStrategyActiveSet = useCallback(async () => {
    try {
      const result = await apiRequest(`${API_BASE_URL}/api/strategy-active-set`, {
        forceRefresh: true,
        priority: REQUEST_PRIORITY.MEDIUM,
      });
      setActiveSetData(result);
      return result;
    } catch (err) {
      setStrategyLabError((current) => current || err.message);
      return null;
    }
  }, []);

  const fetchStrategyLifecycleDashboard = useCallback(async () => {
    try {
      const result = await apiRequest(`${API_BASE_URL}/api/strategy-lifecycle`, {
        forceRefresh: true,
        priority: REQUEST_PRIORITY.MEDIUM,
      });
      setStrategyLifecycleDashboard(result);
      return result;
    } catch (err) {
      setStrategyLabError((current) => current || err.message);
      return null;
    }
  }, []);

  const fetchStrategyDeploymentAllocation = useCallback(async () => {
    try {
      const result = await apiRequest(`${API_BASE_URL}/api/strategy-deployment-allocation`, {
        forceRefresh: true,
        priority: REQUEST_PRIORITY.MEDIUM,
      });
      setStrategyDeploymentAllocation(result);
      return result;
    } catch (err) {
      setStrategyLabError((current) => current || err.message);
      return null;
    }
  }, []);

  const handleSetActiveStrategyExperiment = useCallback(async (experimentId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/active-strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to set active strategy");
      setActiveStrategyConfig(result);
      setActiveSetData(result?.activeSet || null);
      if (!experimentId) {
        localStorage.removeItem(getUserStorageKey(activeStrategyStorageKey));
        setActiveStrategyExperimentId("");
        return result;
      }
      localStorage.setItem(getUserStorageKey(activeStrategyStorageKey), experimentId);
      setActiveStrategyExperimentId(experimentId);
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    }
  }, [activeStrategyStorageKey, getUserStorageKey]);

  const handleAssignStrategyActiveSet = useCallback(
    async (experimentId, contexts) => {
      setRoutingActionLoading(experimentId || "assign");
      setStrategyLabError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/strategy-active-set/assign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experimentId, contexts }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || "Unable to assign strategy to active set");
        setActiveSetData(result);
        await Promise.all([
          fetchStrategyActiveSet(),
          fetchStrategyExperiments(),
          fetchStrategyDeploymentAllocation(),
          fetchStrategyLifecycleDashboard(),
          fetchActiveStrategy(),
        ]);
        return result;
      } catch (err) {
        setStrategyLabError(err.message);
        return null;
      } finally {
        setRoutingActionLoading("");
      }
    },
    [
      fetchActiveStrategy,
      fetchStrategyActiveSet,
      fetchStrategyDeploymentAllocation,
      fetchStrategyExperiments,
      fetchStrategyLifecycleDashboard,
    ]
  );

  const handleRemoveStrategyActiveSet = useCallback(
    async (experimentId, contexts) => {
      setRoutingActionLoading(experimentId || "remove");
      setStrategyLabError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/strategy-active-set/remove`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experimentId, contexts }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || "Unable to remove strategy from active set");
        setActiveSetData(result);
        await Promise.all([
          fetchStrategyActiveSet(),
          fetchStrategyExperiments(),
          fetchStrategyDeploymentAllocation(),
          fetchStrategyLifecycleDashboard(),
          fetchActiveStrategy(),
        ]);
        return result;
      } catch (err) {
        setStrategyLabError(err.message);
        return null;
      } finally {
        setRoutingActionLoading("");
      }
    },
    [
      fetchActiveStrategy,
      fetchStrategyActiveSet,
      fetchStrategyDeploymentAllocation,
      fetchStrategyExperiments,
      fetchStrategyLifecycleDashboard,
    ]
  );

  const resetStrategyExperimentForm = useCallback(() => {
    setStrategyExperimentForm({
      ...defaultStrategyExperiment,
      settings: { ...defaultStrategyExperiment.settings },
    });
    setEditingStrategyExperimentId("");
  }, [defaultStrategyExperiment]);

  const handleSubmitStrategyExperiment = useCallback(async (overrideForm = null) => {
    setStrategyLabError("");
    const formToSubmit = overrideForm || strategyExperimentForm;
    try {
      const response = await fetch(
        editingStrategyExperimentId
          ? `${API_BASE_URL}/api/strategy-experiments/${editingStrategyExperimentId}`
          : `${API_BASE_URL}/api/strategy-experiments`,
        {
          method: editingStrategyExperimentId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formToSubmit.name,
            description: formToSubmit.description,
            status: formToSubmit.status,
            settings: formToSubmit.settings,
          }),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to save strategy experiment");
      setSelectedStrategyExperimentId(result.id);
      setSelectedStrategyRunId(result.runs?.[0]?.id || "");
      resetStrategyExperimentForm();
      await fetchStrategyExperiments();
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    }
  }, [editingStrategyExperimentId, fetchStrategyExperiments, resetStrategyExperimentForm, strategyExperimentForm]);

  const handleEditStrategyExperiment = useCallback((experiment) => {
    setEditingStrategyExperimentId(experiment.id);
    setStrategyExperimentForm({
      name: experiment.name || "",
      description: experiment.description || "",
      status: experiment.status || "DRAFT",
      settings: {
        ...defaultStrategyExperiment.settings,
        ...(experiment.settingsJson || {}),
      },
    });
  }, [defaultStrategyExperiment.settings]);

  const handleDuplicateStrategyExperiment = useCallback((experiment) => {
    setEditingStrategyExperimentId("");
    setStrategyExperimentForm({
      name: `${experiment.name || "Experiment"} Copy`,
      description: experiment.description || "",
      status: "DRAFT",
      settings: {
        ...defaultStrategyExperiment.settings,
        ...(experiment.settingsJson || {}),
      },
    });
  }, [defaultStrategyExperiment.settings]);

  const handleDeleteStrategyExperiment = useCallback(async (experimentId) => {
    setStrategyLabError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-experiments/${experimentId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "Unable to delete strategy experiment");
      }
      if (selectedStrategyExperimentId === experimentId) {
        setSelectedStrategyExperimentId("");
        setSelectedStrategyRunId("");
      }
      await fetchStrategyExperiments();
    } catch (err) {
      setStrategyLabError(err.message);
    }
  }, [fetchStrategyExperiments, selectedStrategyExperimentId]);

  const resetStrategyCopilotDraft = useCallback(() => {
    setStrategyCopilotDraft({
      loading: false,
      error: "",
      mode: "draft",
      result: null,
    });
  }, []);

  const runStrategyCopilotRequest = useCallback(async (mode, endpoint, body, emptyError) => {
    setStrategyCopilotDraft({
      loading: true,
      error: "",
      mode,
      result: null,
    });
    setStrategyLabError("");

    try {
      const result = await apiRequest(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        max429Retries: 1,
        priority: REQUEST_PRIORITY.MEDIUM,
      });
      setStrategyCopilotDraft({
        loading: false,
        error: "",
        mode,
        result,
      });
      return result;
    } catch (err) {
      setStrategyCopilotDraft({
        loading: false,
        error: err.message || emptyError,
        mode,
        result: null,
      });
      return null;
    }
  }, []);

  const getStrategyResearchContext = useCallback((experimentId) => {
    const experiment =
      (strategyExperimentsData.experiments || []).find((item) => item.id === experimentId) || null;
    const lifecycle =
      strategyLifecycleDashboard?.strategies?.find((item) => item.experimentId === experimentId) || null;

    return {
      experimentId,
      strategyName: experiment?.name || "",
      matrixReplay: strategyMatrixReplayResult || null,
      portfolioSimulation: strategyPortfolioResult || null,
      regimeAnalysis: regimeAnalysisResult || null,
      walkForwardResult: walkForwardResult || null,
      stressResult: stressResult || null,
      robustnessResult: experiment?.settingsJson?.robustness || null,
      lifecycle,
      latestSweep: experiment?.parameterSweeps?.[0] || null,
      latestRun: experiment?.runs?.[0] || null,
    };
  }, [
    regimeAnalysisResult,
    strategyExperimentsData.experiments,
    strategyLifecycleDashboard?.strategies,
    strategyMatrixReplayResult,
    strategyPortfolioResult,
    stressResult,
    walkForwardResult,
  ]);

  const handleGenerateStrategyDraft = useCallback(async () => {
    const validationError = validateStrategyCopilotDraftRequest(
      strategyCopilotPrompt,
      strategyCopilotPreferences
    );
    if (validationError) {
      setStrategyCopilotDraft({
        loading: false,
        error: validationError,
        mode: "draft",
        result: null,
      });
      return null;
    }

    return runStrategyCopilotRequest(
      "draft",
      "/api/strategy-experiments/generate-draft",
      buildStrategyCopilotDraftRequest(
        strategyCopilotPrompt,
        strategyCopilotPreferences
      ),
      "Unable to generate strategy draft."
    );
  }, [
    runStrategyCopilotRequest,
    strategyCopilotPreferences,
    strategyCopilotPrompt,
  ]);

  const handleExplainStrategy = useCallback(async (experimentId) => {
    if (!experimentId) {
      setStrategyCopilotDraft({
        loading: false,
        error: "Select a strategy before requesting an explanation.",
        mode: "explain",
        result: null,
      });
      return null;
    }
    return runStrategyCopilotRequest(
      "explain",
      "/api/strategy-experiments/explain",
      { experimentId },
      "Unable to explain strategy."
    );
  }, [runStrategyCopilotRequest]);

  const handleReviewStrategy = useCallback(async (experimentId) => {
    if (!experimentId) {
      setStrategyCopilotDraft({
        loading: false,
        error: "Select a strategy before requesting a review.",
        mode: "review",
        result: null,
      });
      return null;
    }
    return runStrategyCopilotRequest(
      "review",
      "/api/strategy-experiments/review",
      { experimentId },
      "Unable to review strategy."
    );
  }, [runStrategyCopilotRequest]);

  const handleAskStrategyQuestion = useCallback(async (experimentId) => {
    const question = strategyCopilotPrompt.trim();
    if (!experimentId || !question) {
      setStrategyCopilotDraft({
        loading: false,
        error: "Select a strategy and enter a question first.",
        mode: "question",
        result: null,
      });
      return null;
    }
    return runStrategyCopilotRequest(
      "question",
      "/api/strategy-experiments/question",
      { experimentId, question },
      "Unable to answer strategy question."
    );
  }, [runStrategyCopilotRequest, strategyCopilotPrompt]);

  const handleGenerateStrategyResearchReport = useCallback(async (experimentId) => {
    if (!experimentId) {
      setStrategyCopilotDraft({
        loading: false,
        error: "Select a strategy before generating a research report.",
        mode: "research",
        result: null,
      });
      return null;
    }
    return runStrategyCopilotRequest(
      "research",
      "/api/strategy-experiments/research-report",
      { experimentId, ...getStrategyResearchContext(experimentId) },
      "Unable to generate strategy research report."
    );
  }, [getStrategyResearchContext, runStrategyCopilotRequest]);

  const handleAskStrategyResearchQuestion = useCallback(async (experimentId) => {
    const question = strategyCopilotPrompt.trim();
    if (!experimentId || !question) {
      setStrategyCopilotDraft({
        loading: false,
        error: "Select a strategy and enter a research question first.",
        mode: "research-question",
        result: null,
      });
      return null;
    }
    return runStrategyCopilotRequest(
      "research-question",
      "/api/strategy-experiments/research-question",
      { experimentId, question, ...getStrategyResearchContext(experimentId) },
      "Unable to answer strategy research question."
    );
  }, [getStrategyResearchContext, runStrategyCopilotRequest, strategyCopilotPrompt]);

  const handleCompareStrategyVersions = useCallback(async (experimentId, leftVersionId, rightVersionId) => {
    if (!experimentId || !leftVersionId || !rightVersionId) {
      setStrategyCopilotDraft({
        loading: false,
        error: "Choose two saved versions to compare.",
        mode: "version-compare",
        result: null,
      });
      return null;
    }
    return runStrategyCopilotRequest(
      "version-compare",
      "/api/strategy-experiments/version-compare",
      {
        experimentId,
        leftVersionId,
        rightVersionId,
      },
      "Unable to compare strategy versions."
    );
  }, [runStrategyCopilotRequest]);

  const handleProposeStrategyEdit = useCallback(async (experimentId) => {
    const prompt = strategyCopilotPrompt.trim();
    if (!experimentId || !prompt) {
      setStrategyCopilotDraft({
        loading: false,
        error: "Select a strategy and describe the edit first.",
        mode: "edit",
        result: null,
      });
      return null;
    }
    return runStrategyCopilotRequest(
      "edit",
      "/api/strategy-experiments/propose-edit",
      { experimentId, prompt },
      "Unable to propose strategy edit."
    );
  }, [runStrategyCopilotRequest, strategyCopilotPrompt]);

  const handleCompareStrategiesCopilot = useCallback(async (leftExperimentId, rightExperimentId) => {
    if (!leftExperimentId || !rightExperimentId) {
      setStrategyCopilotDraft({
        loading: false,
        error: "Choose two strategies to compare.",
        mode: "compare",
        result: null,
      });
      return null;
    }
    return runStrategyCopilotRequest(
      "compare",
      "/api/strategy-compare/copilot",
      { leftExperimentId, rightExperimentId },
      "Unable to compare strategies."
    );
  }, [runStrategyCopilotRequest]);

  const handleApplyGeneratedStrategyDraft = useCallback(() => {
    const mode = strategyCopilotDraft.mode;
    const draftForm =
      strategyCopilotDraft.result?.draft?.form ||
      strategyCopilotDraft.result?.draft?.after;
    if (!draftForm) {
      return null;
    }

    if (mode === "edit") {
      setEditingStrategyExperimentId(selectedStrategyExperimentId);
    }
    setStrategyExperimentForm({
      ...draftForm,
      settings: { ...draftForm.settings },
    });
    return draftForm;
  }, [selectedStrategyExperimentId, strategyCopilotDraft.mode, strategyCopilotDraft.result]);

  const fetchStrategyMemory = useCallback(async (experimentId) => {
    if (!experimentId) {
      setStrategyMemory(null);
      return null;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-experiments/${experimentId}/memory`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to load strategy memory");
      setStrategyMemory(result);
      return result;
    } catch (err) {
      setStrategyLabError((current) => current || err.message);
      return null;
    }
  }, []);

  const handleApproveAndSaveGeneratedStrategyDraft = useCallback(async () => {
    if (strategyCopilotDraft.mode === "edit") {
      const afterForm = strategyCopilotDraft.result?.draft?.after;
      if (!strategyCopilotDraft.result?.canApprove || !afterForm || !selectedStrategyExperimentId) {
        return null;
      }

      setStrategyLabError("");
      try {
        const result = await apiRequest(`${API_BASE_URL}/api/strategy-experiments/approve-edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: {
            experimentId: selectedStrategyExperimentId,
            proposedForm: afterForm,
            review: strategyCopilotDraft.result?.review || {},
            summary: strategyCopilotDraft.result?.review?.summaryOfChanges || "",
            reason: strategyCopilotPrompt,
          },
          max429Retries: 1,
          priority: REQUEST_PRIORITY.MEDIUM,
        });
        await Promise.all([
          fetchStrategyExperiments(),
          fetchStrategyLifecycleDashboard(),
          fetchStrategyMemory(selectedStrategyExperimentId),
        ]);
        resetStrategyCopilotDraft();
        return result;
      } catch (err) {
        setStrategyLabError(err.message);
        setStrategyCopilotDraft((current) => ({
          ...current,
          loading: false,
          error: err.message,
        }));
        return null;
      }
    }

    const draftForm = strategyCopilotDraft.result?.draft?.form;
    if (!strategyCopilotDraft.result?.canApprove || !draftForm) {
      return null;
    }
    const saved = await handleSubmitStrategyExperiment(draftForm);
    if (saved) {
      resetStrategyCopilotDraft();
    }
    return saved;
  }, [
    fetchStrategyExperiments,
    fetchStrategyLifecycleDashboard,
    fetchStrategyMemory,
    handleSubmitStrategyExperiment,
    resetStrategyCopilotDraft,
    selectedStrategyExperimentId,
    setStrategyLabError,
    strategyCopilotDraft.mode,
    strategyCopilotDraft.result,
    strategyCopilotPrompt,
  ]);

  const handleRunStrategyExperiment = useCallback(async (experimentId, options = {}) => {
    setRunningStrategyExperimentId(experimentId);
    setStrategyLabError("");
    try {
      const shouldSelectRun = options.selectRun !== false;
      const response = await fetch(`${API_BASE_URL}/api/strategy-experiments/${experimentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: strategyRunSymbol,
          symbols: strategyRunSymbol,
          universeMode: strategyRunUniverseMode,
          universeId: strategyRunUniverseMode === "UNIVERSE" ? strategyRunUniverseId : "",
          topN: strategyRunUniverseMode === "SP500_TOP_N" ? strategyRunTopN : "",
          period: strategyRunPeriod,
          startDate: options.startDate || "",
          endDate: options.endDate || "",
          benchmark: options.benchmark || "SPY",
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to run strategy experiment");
      if (shouldSelectRun) {
        setSelectedStrategyExperimentId(experimentId);
        setSelectedStrategyRunId(result.run?.id || "");
      }
      await fetchStrategyExperiments();
      await fetchStrategyLifecycleDashboard();
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    } finally {
      setRunningStrategyExperimentId("");
    }
  }, [
    fetchStrategyExperiments,
    fetchStrategyLifecycleDashboard,
    strategyRunPeriod,
    strategyRunSymbol,
    strategyRunTopN,
    strategyRunUniverseId,
    strategyRunUniverseMode,
  ]);

  const getStrategySweepCombinationCount = useCallback(() => {
    const countRange = (minValue, maxValue, stepValue) => {
      const min = Number(minValue);
      const max = Number(maxValue);
      const step = Math.max(1, Number(stepValue) || 1);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return 1;
      return Math.floor((max - min) / step) + 1;
    };
    return Math.max(
      1,
      countRange(parameterSweepConfig.emaFastMin, parameterSweepConfig.emaFastMax, parameterSweepConfig.emaFastStep) *
        countRange(parameterSweepConfig.emaSlowMin, parameterSweepConfig.emaSlowMax, parameterSweepConfig.emaSlowStep) *
        countRange(parameterSweepConfig.rsiMin, parameterSweepConfig.rsiMax, parameterSweepConfig.rsiStep)
    );
  }, [parameterSweepConfig]);

  const handleRunParameterSweep = useCallback(async (experimentId) => {
    const combinationCount = getStrategySweepCombinationCount();
    let progressTimer = null;
    setRunningSweepExperimentId(experimentId);
    setStrategySweepProgress({ percent: 8, label: `Starting ${combinationCount} combinations` });
    setStrategyLabError("");
    try {
      const estimatedMs = Math.min(60000, Math.max(7000, combinationCount * 400));
      const startedAt = Date.now();
      progressTimer = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const estimatedPercent = Math.min(92, 8 + (elapsed / estimatedMs) * 84);
        setStrategySweepProgress({ percent: estimatedPercent, label: `Running ${combinationCount} combinations` });
      }, 500);
      const response = await fetch(`${API_BASE_URL}/api/strategy-experiments/${experimentId}/parameter-sweep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parameterSweepConfig),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to run parameter sweep");
      setSelectedStrategyExperimentId(experimentId);
      await fetchStrategyExperiments();
      await fetchStrategyLifecycleDashboard();
      setStrategySweepProgress({ percent: 100, label: `Completed ${result.sweep?.totalRuns || combinationCount} combinations` });
    } catch (err) {
      setStrategyLabError(err.message);
      setStrategySweepProgress({ percent: 100, label: "Sweep failed" });
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      setRunningSweepExperimentId("");
    }
  }, [fetchStrategyExperiments, fetchStrategyLifecycleDashboard, getStrategySweepCombinationCount, parameterSweepConfig]);

  const handleRunRobustness = useCallback(async (experimentId) => {
    setRunningRobustnessExperimentId(experimentId);
    setStrategyLabError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-experiments/${experimentId}/robustness`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: strategyRunSymbol,
          symbols: strategyRunSymbol,
          universeMode: strategyRunUniverseMode,
          universeId: strategyRunUniverseMode === "UNIVERSE" ? strategyRunUniverseId : "",
          topN: strategyRunUniverseMode === "SP500_TOP_N" ? strategyRunTopN : "",
          period: strategyRunPeriod,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to run robustness test");
      await fetchStrategyExperiments();
      await fetchStrategyLifecycleDashboard();
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    } finally {
      setRunningRobustnessExperimentId("");
    }
  }, [
    fetchStrategyExperiments,
    fetchStrategyLifecycleDashboard,
    strategyRunPeriod,
    strategyRunSymbol,
    strategyRunTopN,
    strategyRunUniverseId,
    strategyRunUniverseMode,
  ]);

  const fetchStrategyLeaderboard = useCallback(async () => {
    try {
      const result = await apiRequest(`${API_BASE_URL}/api/strategy-leaderboard`, {
        cacheTtl: 15_000,
        priority: REQUEST_PRIORITY.LOW,
        staleTtl: 60_000,
      });
      setStrategyLeaderboard(result);
      return result;
    } catch (err) {
      setStrategyLabError((current) => current || err.message);
      return null;
    }
  }, []);

  const handleRunWalkForward = useCallback(async (experimentId, options = {}) => {
    setRunningWalkForwardExperimentId(experimentId);
    setStrategyLabError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-experiments/${experimentId}/walk-forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: strategyRunSymbol,
          symbols: strategyRunSymbol,
          universeMode: strategyRunUniverseMode,
          universeId: strategyRunUniverseMode === "UNIVERSE" ? strategyRunUniverseId : "",
          topN: strategyRunUniverseMode === "SP500_TOP_N" ? strategyRunTopN : "",
          period: strategyRunPeriod,
          mode: options.mode || "ANCHORED",
          ...options,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to run walk-forward test");
      setWalkForwardResult(result);
      await fetchStrategyExperiments();
      await fetchStrategyLeaderboard();
      await fetchStrategyLifecycleDashboard();
      await fetchStrategyMemory(experimentId);
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    } finally {
      setRunningWalkForwardExperimentId("");
    }
  }, [
    fetchStrategyExperiments,
    fetchStrategyLifecycleDashboard,
    fetchStrategyLeaderboard,
    fetchStrategyMemory,
    strategyRunPeriod,
    strategyRunSymbol,
    strategyRunTopN,
    strategyRunUniverseId,
    strategyRunUniverseMode,
  ]);

  const handleRunRegimeAnalysis = useCallback(async (experimentId) => {
    setRunningRegimeExperimentId(experimentId);
    setStrategyLabError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-experiments/${experimentId}/regime-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to run regime analysis");
      setRegimeAnalysisResult(result);
      await fetchStrategyLifecycleDashboard();
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    } finally {
      setRunningRegimeExperimentId("");
    }
  }, [fetchStrategyLifecycleDashboard]);

  const handleRunStressTest = useCallback(async (experimentId, options = {}) => {
    setRunningStressExperimentId(experimentId);
    setStrategyLabError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-experiments/${experimentId}/stress-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to run Monte Carlo stress test");
      setStressResult(result);
      await fetchStrategyExperiments();
      await fetchStrategyLeaderboard();
      await fetchStrategyLifecycleDashboard();
      await fetchStrategyMemory(experimentId);
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    } finally {
      setRunningStressExperimentId("");
    }
  }, [fetchStrategyExperiments, fetchStrategyLifecycleDashboard, fetchStrategyLeaderboard, fetchStrategyMemory]);

  const handleRunPortfolioSimulation = useCallback(async (experimentIds, options = {}) => {
    setRunningPortfolioSimulation(true);
    setStrategyLabError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-portfolio-simulation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experimentIds,
          allocationMode: options.allocationMode || "EQUAL",
          weights: options.weights || {},
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to simulate strategy portfolio");
      setStrategyPortfolioResult(result);
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    } finally {
      setRunningPortfolioSimulation(false);
    }
  }, []);

  const handleRunMatrixReplay = useCallback(async (options = {}) => {
    setRunningMatrixReplay(true);
    setStrategyLabError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-matrix-replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...options,
          symbol: strategyRunSymbol,
          symbols: strategyRunSymbol,
          universeMode: strategyRunUniverseMode,
          universeId: strategyRunUniverseMode === "UNIVERSE" ? strategyRunUniverseId : "",
          topN: strategyRunUniverseMode === "SP500_TOP_N" ? strategyRunTopN : "",
          period: strategyRunPeriod,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to run matrix replay");
      setStrategyMatrixReplayResult(result);
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    } finally {
      setRunningMatrixReplay(false);
    }
  }, [
    strategyRunPeriod,
    strategyRunSymbol,
    strategyRunTopN,
    strategyRunUniverseId,
    strategyRunUniverseMode,
  ]);

  const handleSaveStrategyDeploymentAllocation = useCallback(async (payload) => {
    setSavingStrategyDeploymentAllocation(true);
    setStrategyLabError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-deployment-allocation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Unable to save deployment allocation");
      }
      setStrategyDeploymentAllocation(result);
      await Promise.all([
        fetchActiveStrategy(),
        fetchStrategyActiveSet(),
        fetchStrategyExperiments(),
        fetchStrategyLifecycleDashboard(),
      ]);
      return result;
    } catch (err) {
      setStrategyLabError(err.message);
      return null;
    } finally {
      setSavingStrategyDeploymentAllocation(false);
    }
  }, [
    fetchActiveStrategy,
    fetchStrategyActiveSet,
    fetchStrategyExperiments,
    fetchStrategyLifecycleDashboard,
  ]);

  useEffect(() => {
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    let compiledStrategy;
    try {
      compiledStrategy = serializeStrategyBuilderState(strategyExperimentForm);
      if (!validateStrategyJson(compiledStrategy).success) {
        cancelRequestGroup("strategy-preview");
        setStrategyPreview({ loading: false, error: "", result: null });
        return undefined;
      }
    } catch {
      cancelRequestGroup("strategy-preview");
      setStrategyPreview({ loading: false, error: "", result: null });
      return undefined;
    }
    setStrategyPreview((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    const timer = window.setTimeout(async () => {
      try {
        const result = await apiRequest(`${API_BASE_URL}/api/strategy-experiments/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: {
            name: strategyExperimentForm.name,
            description: strategyExperimentForm.description,
            settings: strategyExperimentForm.settings,
            symbol: strategyRunSymbol || "AAPL",
            period: "6mo",
          },
          cacheResponse: true,
          cacheTtl: 15_000,
          cancelGroup: "strategy-preview",
          dedupe: true,
          max429Retries: 1,
          priority: REQUEST_PRIORITY.LOW,
          staleTtl: 30_000,
        });
        if (previewRequestIdRef.current !== requestId) return;
        setStrategyPreview({
          loading: false,
          error: "",
          result,
        });
      } catch (err) {
        if (err.name === "AbortError") return;
        if (previewRequestIdRef.current !== requestId) return;
        setStrategyPreview({
          loading: false,
          error: err.message,
          result: null,
        });
      }
    }, 1_200);

    return () => {
      window.clearTimeout(timer);
      cancelRequestGroup("strategy-preview");
    };
  }, [
    strategyExperimentForm,
    strategyRunSymbol,
  ]);

  return {
    activeStrategyConfig,
    activeSetData,
    activeStrategyExperimentId,
    editingStrategyExperimentId,
    fetchActiveStrategy,
    fetchStrategyActiveSet,
    fetchStrategyDeploymentAllocation,
    fetchStrategyLeaderboard,
    fetchStrategyLifecycleDashboard,
    fetchStrategyExperiments,
    fetchStrategyMemory,
    handleAssignStrategyActiveSet,
    handleAskStrategyQuestion,
    handleAskStrategyResearchQuestion,
    handleApplyGeneratedStrategyDraft,
    handleApproveAndSaveGeneratedStrategyDraft,
    handleCompareStrategiesCopilot,
    handleCompareStrategyVersions,
    handleDeleteStrategyExperiment,
    handleDuplicateStrategyExperiment,
    handleEditStrategyExperiment,
    handleExplainStrategy,
    handleGenerateStrategyDraft,
    handleGenerateStrategyResearchReport,
    handleProposeStrategyEdit,
    handleRemoveStrategyActiveSet,
    handleReviewStrategy,
    handleRunParameterSweep,
    handleRunPortfolioSimulation,
    handleRunMatrixReplay,
    handleRunRegimeAnalysis,
    handleRunRobustness,
    handleSaveStrategyDeploymentAllocation,
    handleRunStressTest,
    handleRunStrategyExperiment,
    handleRunWalkForward,
    handleSetActiveStrategyExperiment,
    handleSubmitStrategyExperiment,
    parameterSweepConfig,
    resetStrategyCopilotDraft,
    resetStrategyExperimentForm,
    routingActionLoading,
    runningStrategyExperimentId,
    runningRobustnessExperimentId,
    runningRegimeExperimentId,
    runningStressExperimentId,
    runningSweepExperimentId,
    runningWalkForwardExperimentId,
    runningPortfolioSimulation,
    runningMatrixReplay,
    selectedStrategyExperimentId,
    selectedStrategyRunId,
    setActiveStrategyConfig,
    setParameterSweepConfig,
    setSelectedStrategyExperimentId,
    setSelectedStrategyRunId,
    setStrategyCopilotPrompt,
    setStrategyCopilotPreferences,
    setStrategyCopilotCompareTargetId,
    setStrategyCopilotCompareVersionId,
    setStrategyDeploymentAllocation,
    setStrategyExperimentForm,
    setStrategyLabError,
    setStrategyRunPeriod,
    setStrategyRunSymbol,
    setStrategyRunTopN,
    setStrategyRunUniverseId,
    setStrategyRunUniverseMode,
    strategyCopilotDraft,
    strategyCopilotCompareTargetId,
    strategyCopilotCompareVersionId,
    strategyCopilotPreferences,
    strategyCopilotPrompt,
    strategyExperimentForm,
    strategyDeploymentAllocation,
    strategyExperimentsData,
    strategyLabError,
    strategyLeaderboard,
    strategyLifecycleDashboard,
    strategyMemory,
    strategyPortfolioResult,
    strategyMatrixReplayResult,
    strategyPreview,
    strategyRunPeriod,
    strategyRunSymbol,
    strategyRunTopN,
    strategyRunUniverseId,
    strategyRunUniverseMode,
    strategySweepProgress,
    regimeAnalysisResult,
    savingStrategyDeploymentAllocation,
    stressResult,
    walkForwardResult,
  };
}
