import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";

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
  const previewRequestIdRef = useRef(0);
  const previewAbortRef = useRef(null);
  const [strategySweepProgress, setStrategySweepProgress] = useState({
    percent: 0,
    label: "Idle",
  });

  const fetchStrategyExperiments = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-experiments`);
      if (!response.ok) throw new Error("Unable to load strategy experiments");
      const nextExperiments = await response.json();
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
      const response = await fetch(`${API_BASE_URL}/api/active-strategy`);
      if (!response.ok) throw new Error("Unable to load active strategy");
      const nextActiveStrategy = await response.json();
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
      const response = await fetch(`${API_BASE_URL}/api/strategy-active-set`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to load active strategy set");
      setActiveSetData(result);
      return result;
    } catch (err) {
      setStrategyLabError((current) => current || err.message);
      return null;
    }
  }, []);

  const fetchStrategyLifecycleDashboard = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-lifecycle`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to load strategy lifecycle");
      setStrategyLifecycleDashboard(result);
      return result;
    } catch (err) {
      setStrategyLabError((current) => current || err.message);
      return null;
    }
  }, []);

  const fetchStrategyDeploymentAllocation = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/strategy-deployment-allocation`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to load deployment allocation");
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

  const handleSubmitStrategyExperiment = useCallback(async () => {
    setStrategyLabError("");
    try {
      const response = await fetch(
        editingStrategyExperimentId
          ? `${API_BASE_URL}/api/strategy-experiments/${editingStrategyExperimentId}`
          : `${API_BASE_URL}/api/strategy-experiments`,
        {
          method: editingStrategyExperimentId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: strategyExperimentForm.name,
            description: strategyExperimentForm.description,
            status: strategyExperimentForm.status,
            settings: strategyExperimentForm.settings,
          }),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to save strategy experiment");
      setSelectedStrategyExperimentId(result.id);
      setSelectedStrategyRunId(result.runs?.[0]?.id || "");
      resetStrategyExperimentForm();
      await fetchStrategyExperiments();
    } catch (err) {
      setStrategyLabError(err.message);
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
      const response = await fetch(`${API_BASE_URL}/api/strategy-leaderboard`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to load strategy leaderboard");
      setStrategyLeaderboard(result);
      return result;
    } catch (err) {
      setStrategyLabError((current) => current || err.message);
      return null;
    }
  }, []);

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
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setStrategyPreview((current) => ({
      ...current,
      loading: true,
      error: "",
    }));

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/strategy-experiments/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            name: strategyExperimentForm.name,
            description: strategyExperimentForm.description,
            settings: strategyExperimentForm.settings,
            symbol: strategyRunSymbol || "AAPL",
            period: "6mo",
          }),
        });
        const result = await response.json().catch(() => null);
        if (previewRequestIdRef.current !== requestId) return;
        if (!response.ok) {
          throw new Error(result?.error || "Unable to run strategy preview");
        }
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
    }, 750);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    strategyExperimentForm.description,
    strategyExperimentForm.name,
    strategyExperimentForm.settings,
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
    handleDeleteStrategyExperiment,
    handleDuplicateStrategyExperiment,
    handleEditStrategyExperiment,
    handleRemoveStrategyActiveSet,
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
    setStrategyDeploymentAllocation,
    setStrategyExperimentForm,
    setStrategyLabError,
    setStrategyRunPeriod,
    setStrategyRunSymbol,
    setStrategyRunTopN,
    setStrategyRunUniverseId,
    setStrategyRunUniverseMode,
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
