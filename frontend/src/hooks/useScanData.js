import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../services/apiClient";

export default function useScanData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [eventDegradedDataSources, setEventDegradedDataSources] = useState({});
  const [dataHealth, setDataHealth] = useState(null);
  const [systemDataHealth, setSystemDataHealth] = useState(null);
  const [dataHealthError, setDataHealthError] = useState("");

  const applyScanData = useCallback((nextData) => {
    setData(nextData);
    setError("");
  }, []);

  const mergeScanData = useCallback((nextData) => {
    setData((currentData) => {
      if (!currentData?.opportunities?.length) return nextData;

      const mergedBySymbol = new Map();
      currentData.opportunities.forEach((opportunity) => {
        const symbol = String(opportunity.symbol || opportunity.display_symbol || "").toUpperCase();
        if (symbol) mergedBySymbol.set(symbol, opportunity);
      });
      (nextData?.opportunities || []).forEach((opportunity) => {
        const symbol = String(opportunity.symbol || opportunity.display_symbol || "").toUpperCase();
        if (symbol) mergedBySymbol.set(symbol, opportunity);
      });

      return {
        ...currentData,
        ...nextData,
        opportunities: [...mergedBySymbol.values()],
        merged_scan: true,
      };
    });
    setError("");
  }, []);

  const fetchScanResults = useCallback(async ({ background = false } = {}) => {
    if (background) setIsRefreshing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/scan-results`);
      if (!response.ok) throw new Error("Unable to load scan results");
      applyScanData(await response.json());
    } catch (err) {
      setError(err.message);
    } finally {
      if (background) setIsRefreshing(false);
    }
  }, [applyScanData]);

  const updateScanData = useCallback((updater) => {
    setData(updater);
  }, []);

  const fetchDataHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/data-health`);
      if (!response.ok) throw new Error("Unable to load data health");
      setDataHealth(await response.json());
      setDataHealthError("");
    } catch (err) {
      setDataHealthError(err.message);
    }
  }, []);

  const fetchSystemDataHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/system/data-health`);
      setSystemDataHealth(await response.json());
    } catch (err) {
      setSystemDataHealth({
        prisma: "disconnected",
        jsonFallbackActive: false,
        degradedMode: true,
        stale: true,
        warning: err.message,
      });
    }
  }, []);

  const degradedDataSources = useMemo(() => {
    const nextSources = {};
    if (data?.degradedMode || data?.degraded_mode) {
      nextSources.scanResults = data.warning || "Scan results are running in degraded mode.";
    }
    if (dataHealth?.degradedMode || dataHealth?.degraded_mode) {
      nextSources.dataHealth = dataHealth.warning || "Data health is degraded.";
    }
    if (systemDataHealth?.degradedMode || systemDataHealth?.degraded_mode) {
      nextSources.system = systemDataHealth.warning || "System data health is degraded.";
    }
    return { ...nextSources, ...eventDegradedDataSources };
  }, [data, dataHealth, eventDegradedDataSources, systemDataHealth]);

  useEffect(() => {
    const handleDataSource = (event) => {
      const detail = event.detail || {};
      setEventDegradedDataSources((current) => {
        const next = { ...current };
        if (detail.degradedMode) next[detail.url] = detail.dataSource;
        else delete next[detail.url];
        return next;
      });
    };

    window.addEventListener("trading-dashboard:data-source", handleDataSource);
    return () => window.removeEventListener("trading-dashboard:data-source", handleDataSource);
  }, []);

  return {
    applyScanData,
    data,
    dataHealth,
    dataHealthError,
    degradedDataSources,
    error,
    fetchDataHealth,
    fetchScanResults,
    fetchSystemDataHealth,
    isRefreshing,
    mergeScanData,
    setError,
    systemDataHealth,
    updateScanData,
  };
}
