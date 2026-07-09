import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";
import useBrokerAccount from "./useBrokerAccount";
import useBrokerCapabilities from "./useBrokerCapabilities";
import useBrokerFills from "./useBrokerFills";
import useBrokerHealth from "./useBrokerHealth";
import useBrokerLogs from "./useBrokerLogs";
import useBrokerOrders from "./useBrokerOrders";
import useBrokerPreflight from "./useBrokerPreflight";
import useBrokerReconciliation from "./useBrokerReconciliation";

const DEFAULT_IBKR_CONFIG = {
  host: "127.0.0.1",
  port: "7497",
  clientId: "11",
  mode: "paper",
};

export default function useBroker({ enabled = true } = {}) {
  const brokerHealth = useBrokerHealth({ autoLoad: false, enabled });
  const brokerAccount = useBrokerAccount({ autoLoad: false, enabled });
  const brokerCapabilities = useBrokerCapabilities({ autoLoad: false, enabled });
  const brokerOrders = useBrokerOrders({ autoLoad: false, enabled });
  const brokerFills = useBrokerFills({ autoLoad: false, enabled });
  const brokerReconciliation = useBrokerReconciliation({ autoLoad: false, enabled });
  const brokerLogs = useBrokerLogs({ autoLoad: false, enabled });
  const brokerPreflight = useBrokerPreflight({ autoLoad: false, enabled });
  const didInitialReadinessRefreshRef = useRef(false);
  const readinessRefreshPromiseRef = useRef(null);
  const [ibkrStatus, setIbkrStatus] = useState(null);
  const [ibkrConfig, setIbkrConfig] = useState(DEFAULT_IBKR_CONFIG);
  const [ibkrError, setIbkrError] = useState("");
  const [isSavingIbkrConfig, setIsSavingIbkrConfig] = useState(false);
  const [isTestingIbkrConnection, setIsTestingIbkrConnection] = useState(false);

  const applyIbkrStatus = useCallback((nextStatus) => {
    setIbkrStatus(nextStatus);
    setIbkrConfig({
      host: nextStatus.host || DEFAULT_IBKR_CONFIG.host,
      port: String(nextStatus.port || DEFAULT_IBKR_CONFIG.port),
      clientId: String(nextStatus.clientId ?? DEFAULT_IBKR_CONFIG.clientId),
      mode: nextStatus.mode || DEFAULT_IBKR_CONFIG.mode,
    });
    setIbkrError("");
  }, []);

  const fetchIbkrStatus = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/ibkr/status`);
      if (!response.ok) throw new Error("Unable to load IBKR status");
      applyIbkrStatus(await response.json());
    } catch (err) {
      setIbkrError(err.message);
    }
  }, [applyIbkrStatus, enabled]);

  const handleIbkrConfigChange = useCallback((field, value) => {
    setIbkrConfig((current) => ({ ...current, [field]: value }));
  }, []);

  const handleSaveIbkrConfig = useCallback(async () => {
    setIsSavingIbkrConfig(true);
    setIbkrError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/ibkr/save-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ibkrConfig),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to save IBKR config");
      applyIbkrStatus(result);
    } catch (err) {
      setIbkrError(err.message);
    } finally {
      setIsSavingIbkrConfig(false);
    }
  }, [applyIbkrStatus, ibkrConfig]);

  const handleTestIbkrConnection = useCallback(async () => {
    setIsTestingIbkrConnection(true);
    setIbkrError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/ibkr/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ibkrConfig),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok && !result?.connection_test) {
        throw new Error(result?.error || "Unable to test IBKR connection");
      }
      applyIbkrStatus(result);
      await Promise.allSettled([
        brokerHealth.refresh(),
        brokerCapabilities.refresh(),
        brokerAccount.refresh(),
        brokerOrders.refresh(),
        brokerFills.refresh(),
        brokerReconciliation.refresh(),
        brokerLogs.refresh(),
        brokerPreflight.refresh(),
      ]);
      if (result.error) setIbkrError(result.error);
    } catch (err) {
      setIbkrError(err.message);
    } finally {
      setIsTestingIbkrConnection(false);
    }
  }, [
    applyIbkrStatus,
    brokerAccount,
    brokerCapabilities,
    brokerFills,
    brokerHealth,
    brokerLogs,
    brokerOrders,
    brokerPreflight,
    brokerReconciliation,
    ibkrConfig,
  ]);

  const refreshBrokerReadiness = useCallback(async () => {
    if (!enabled) return;
    if (readinessRefreshPromiseRef.current) {
      return readinessRefreshPromiseRef.current;
    }

    readinessRefreshPromiseRef.current = (async () => {
      const refreshOptions = { forceRefresh: true };
      const health = await brokerHealth.refresh(refreshOptions);
      await brokerAccount.refresh(refreshOptions);
      await brokerCapabilities.refresh();
      await brokerOrders.refresh(refreshOptions);
      await brokerFills.refresh(refreshOptions);
      await brokerReconciliation.refresh(refreshOptions);
      await brokerLogs.refresh(refreshOptions);
      await brokerPreflight.refresh(refreshOptions);
      if (health) {
        setIbkrStatus((current) => ({
          ...(current || {}),
          status: health.status || (health.connected ? "CONNECTED" : "ERROR"),
          host: health.config?.host,
          port: health.config?.port,
          clientId: health.config?.clientId,
          mode: health.config?.mode,
          last_checked_at: health.lastHeartbeat,
          account_summary_available: health.accountLoaded,
          error: health.lastError,
        }));
      }
    })().finally(() => {
      readinessRefreshPromiseRef.current = null;
    });

    return readinessRefreshPromiseRef.current;
  }, [
    brokerAccount,
    brokerCapabilities,
    brokerFills,
    brokerHealth,
    brokerLogs,
    brokerOrders,
    brokerPreflight,
    brokerReconciliation,
    enabled,
  ]);

  useEffect(() => {
    if (!enabled) {
      didInitialReadinessRefreshRef.current = false;
      return;
    }

    if (didInitialReadinessRefreshRef.current) {
      return;
    }

    didInitialReadinessRefreshRef.current = true;
    refreshBrokerReadiness();
  }, [enabled, refreshBrokerReadiness]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleSessionChange = () => {
      refreshBrokerReadiness();
    };

    window.addEventListener(
      "trading-dashboard:trading-session-changed",
      handleSessionChange
    );
    window.addEventListener(
      "trading-dashboard:broker-reconciliation-synced",
      handleSessionChange
    );

    return () => {
      window.removeEventListener(
        "trading-dashboard:trading-session-changed",
        handleSessionChange
      );
      window.removeEventListener(
        "trading-dashboard:broker-reconciliation-synced",
        handleSessionChange
      );
    };
  }, [enabled, refreshBrokerReadiness]);

  return {
    brokerAccount,
    brokerCapabilities,
    brokerFills,
    brokerHealth,
    brokerLogs,
    brokerOrders,
    brokerPreflight,
    brokerReconciliation,
    fetchIbkrStatus,
    handleIbkrConfigChange,
    handleSaveIbkrConfig,
    handleTestIbkrConnection,
    ibkrConfig,
    ibkrError,
    ibkrStatus,
    isSavingIbkrConfig,
    isTestingIbkrConnection,
    refreshBrokerReadiness,
  };
}
