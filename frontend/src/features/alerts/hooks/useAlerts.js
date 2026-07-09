import { useCallback, useMemo, useState } from "react";
import { API_BASE_URL, apiFetch as fetch } from "../../../services/apiClient";

const DEFAULT_TELEGRAM_FORM = {
  telegramBotToken: "",
  digestMode: "immediate",
};

const DEFAULT_ALERT_RULE_FORM = {
  name: "High confidence only",
  minConfidence: "80",
  minScore: "70",
  market: "ALL",
};

export default function useAlerts() {
  const [alertsData, setAlertsData] = useState({ alerts: [] });
  const [alertActionId, setAlertActionId] = useState("");
  const [notificationChannels, setNotificationChannels] = useState([]);
  const [alertRules, setAlertRules] = useState([]);
  const [telegramForm, setTelegramForm] = useState(DEFAULT_TELEGRAM_FORM);
  const [telegramStatus, setTelegramStatus] = useState("");
  const [alertRuleForm, setAlertRuleForm] = useState(DEFAULT_ALERT_RULE_FORM);

  const fetchAlerts = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/alerts?includeResolved=true`);
      if (!response.ok) throw new Error("Unable to load alerts");
      setAlertsData(await response.json());
    } catch (err) {
      setAlertsData({ alerts: [], error: err.message });
    }
  }, []);

  const fetchNotificationChannels = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/notification-channels`);
      if (!response.ok) throw new Error("Unable to load notification channels");
      const payload = await response.json();
      setNotificationChannels(payload.channels || []);
    } catch (err) {
      setTelegramStatus(err.message);
    }
  }, []);

  const fetchAlertRules = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/alert-rules`);
      if (!response.ok) throw new Error("Unable to load alert rules");
      const payload = await response.json();
      setAlertRules(payload.rules || []);
    } catch (err) {
      setAlertsData((current) => ({ ...current, error: err.message }));
    }
  }, []);

  const handleAlertAction = useCallback(async (id, action, options = {}) => {
    setAlertActionId(id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || `Unable to ${action} alert`);
      await fetchAlerts();
    } catch (err) {
      setAlertsData((current) => ({ ...current, error: err.message }));
    } finally {
      setAlertActionId("");
    }
  }, [fetchAlerts]);

  const handleSaveTelegramChannel = useCallback(async () => {
    setTelegramStatus("Saving Telegram channel...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/notification-channels/telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramForm),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to save Telegram channel");
      setTelegramForm((current) => ({ ...current, telegramBotToken: "" }));
      setTelegramStatus(
        result.verificationCode
          ? `Send /connect ${result.verificationCode} to your Telegram bot, then verify.`
          : "Telegram channel saved."
      );
      fetchNotificationChannels();
    } catch (err) {
      setTelegramStatus(err.message);
    }
  }, [fetchNotificationChannels, telegramForm]);

  const handleVerifyTelegramChannel = useCallback(async () => {
    setTelegramStatus("Checking Telegram messages...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/notification-channels/telegram/verify`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to verify Telegram channel");
      setTelegramStatus(result.message || "Telegram channel verified.");
      fetchNotificationChannels();
    } catch (err) {
      setTelegramStatus(err.message);
    }
  }, [fetchNotificationChannels]);

  const handleSendTelegramTest = useCallback(async () => {
    setTelegramStatus("Sending test alert...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/notification-channels/telegram/test`, {
        method: "POST",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to send test alert");
      setTelegramStatus(`Processed ${result.processed ?? 0} delivery attempt(s).`);
      fetchAlerts();
      fetchNotificationChannels();
    } catch (err) {
      setTelegramStatus(err.message);
    }
  }, [fetchAlerts, fetchNotificationChannels]);

  const handleCreateAlertRule = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/alert-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: alertRuleForm.name,
          category: "SCANNER",
          severity: "HIGH",
          conditions: {
            confidenceGreaterThan: Number(alertRuleForm.minConfidence),
            scoreGreaterThan: Number(alertRuleForm.minScore),
            market: alertRuleForm.market,
          },
          actions: {
            notifyTelegram: true,
          },
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Unable to create alert rule");
      fetchAlertRules();
    } catch (err) {
      setAlertsData((current) => ({ ...current, error: err.message }));
    }
  }, [alertRuleForm, fetchAlertRules]);

  const visibleAlerts = useMemo(() => alertsData.alerts || [], [alertsData.alerts]);
  const alertSummary = alertsData.summary || {};
  const alertDigest = alertsData.digest || [];
  const alertHealth = alertsData.health || {};
  const alertNeedsAction = useMemo(
    () => visibleAlerts.filter((alert) => alert.status === "ACTIVE"),
    [visibleAlerts]
  );
  const alertRecent = useMemo(
    () => visibleAlerts.filter((alert) => ["ACKNOWLEDGED", "SNOOZED"].includes(alert.status)),
    [visibleAlerts]
  );
  const alertResolved = useMemo(
    () => visibleAlerts.filter((alert) => alert.status === "RESOLVED"),
    [visibleAlerts]
  );
  const telegramChannel = useMemo(
    () => notificationChannels.find((channel) => String(channel.type || "").toUpperCase() === "TELEGRAM"),
    [notificationChannels]
  );
  const usefulAlerts = useMemo(
    () => [...visibleAlerts]
      .filter((alert) => alert.status === "RESOLVED" || alert.status === "ACKNOWLEDGED")
      .sort((left, right) => (right.occurrences || 1) - (left.occurrences || 1))
      .slice(0, 5),
    [visibleAlerts]
  );

  return {
    alertActionId,
    alertDigest,
    alertHealth,
    alertNeedsAction,
    alertRecent,
    alertResolved,
    alertRuleForm,
    alertRules,
    alertSummary,
    alertsData,
    fetchAlertRules,
    fetchAlerts,
    fetchNotificationChannels,
    handleAlertAction,
    handleCreateAlertRule,
    handleSaveTelegramChannel,
    handleSendTelegramTest,
    handleVerifyTelegramChannel,
    notificationChannels,
    setAlertRuleForm,
    setTelegramForm,
    telegramChannel,
    telegramForm,
    telegramStatus,
    usefulAlerts,
    visibleAlerts,
  };
}
