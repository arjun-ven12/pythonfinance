import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BROKER_PROVIDERS, normalizeBrokerProvider } from "../brokerMetadata";
import { syncBrokerLedger } from "./brokerApi";

const DEFAULT_SYNC_STATE = {
  status: "IDLE",
  message: "",
  error: "",
  lastStartedAt: null,
  lastCompletedAt: null,
  lastReason: "",
};

const ACTIVE_SYNC_STATES = new Set(["CHECKING", "SYNCING"]);
const listeners = new Set();
let sharedSyncState = { ...DEFAULT_SYNC_STATE };
let sharedSyncPromise = null;
let lastAutoSyncFingerprint = "";
let lastAutoSyncAt = 0;
let idleResetTimer = null;

export function __resetAutoBrokerLedgerSyncForTests() {
  window.clearTimeout(idleResetTimer);
  idleResetTimer = null;
  sharedSyncPromise = null;
  lastAutoSyncFingerprint = "";
  lastAutoSyncAt = 0;
  listeners.clear();
  emitSharedSyncState({ ...DEFAULT_SYNC_STATE });
}

function emitSharedSyncState(nextState) {
  sharedSyncState = nextState;
  listeners.forEach((listener) => listener(sharedSyncState));
}

function subscribeToSharedSyncState(listener) {
  listeners.add(listener);
  listener(sharedSyncState);
  return () => {
    listeners.delete(listener);
  };
}

function scheduleIdleReset() {
  window.clearTimeout(idleResetTimer);
  idleResetTimer = window.setTimeout(() => {
    emitSharedSyncState({
      ...DEFAULT_SYNC_STATE,
      lastCompletedAt: sharedSyncState.lastCompletedAt,
    });
  }, 5000);
}

function createSyncFingerprint(provider, reconciliation, reason, triggerKey) {
  return JSON.stringify({
    provider,
    reason,
    triggerKey: triggerKey || "",
    syncScore: Number(reconciliation?.syncScore ?? 0),
    status: reconciliation?.status || "UNKNOWN",
    cashDifference: Number(reconciliation?.cashDifference ?? 0),
    missingPositions: reconciliation?.missingPositions?.length || 0,
    extraPositions: reconciliation?.extraPositions?.length || 0,
  });
}

function shouldAutoSyncReconciliation(reconciliation) {
  if (!reconciliation) return false;
  const syncScore = Number(reconciliation?.syncScore);
  if (!Number.isFinite(syncScore)) return false;
  return syncScore < 100;
}

async function runSharedSync({
  reason,
  provider,
  requestSync,
  onSynced,
  onFailed,
}) {
  if (sharedSyncPromise) {
    return sharedSyncPromise;
  }

  const startedAt = new Date().toISOString();
  emitSharedSyncState({
    ...sharedSyncState,
    status: "CHECKING",
    message: "Broker reconciliation in progress...",
    error: "",
    lastStartedAt: startedAt,
    lastReason: reason,
  });

  sharedSyncPromise = (async () => {
    try {
      emitSharedSyncState({
        ...sharedSyncState,
        status: "SYNCING",
        message: "Broker reconciliation in progress...",
        error: "",
        lastStartedAt: startedAt,
        lastReason: reason,
      });

      const result = await requestSync();
      const completedAt = new Date().toISOString();

      emitSharedSyncState({
        ...sharedSyncState,
        status: "SUCCESS",
        message: "Broker successfully synchronized.",
        error: "",
        lastCompletedAt: completedAt,
        lastReason: reason,
      });

      window.dispatchEvent(
        new CustomEvent("trading-dashboard:trading-session-changed", {
          detail: { provider, source: "auto-broker-reconciliation-sync" },
        })
      );
      window.dispatchEvent(
        new CustomEvent("trading-dashboard:broker-reconciliation-synced", {
          detail: { provider, reason, result },
        })
      );

      await onSynced?.(result);
      scheduleIdleReset();
      return result;
    } catch (error) {
      emitSharedSyncState({
        ...sharedSyncState,
        status: "FAILED",
        message: "Broker reconciliation failed.",
        error: error.message,
        lastCompletedAt: new Date().toISOString(),
        lastReason: reason,
      });
      await onFailed?.(error);
      throw error;
    } finally {
      sharedSyncPromise = null;
    }
  })();

  return sharedSyncPromise;
}

export default function useAutoBrokerLedgerSync({
  enabled = true,
  provider,
  reconciliation,
  triggerKey = "",
  debounceMs = 5000,
  requestSync = syncBrokerLedger,
  onSynced,
  onFailed,
} = {}) {
  const [syncState, setSyncState] = useState(sharedSyncState);
  const onSyncedRef = useRef(onSynced);
  const onFailedRef = useRef(onFailed);

  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  useEffect(() => subscribeToSharedSyncState(setSyncState), []);

  const normalizedProvider = useMemo(
    () =>
      normalizeBrokerProvider(provider, BROKER_PROVIDERS.INTERNAL_PAPER),
    [provider]
  );

  const canSyncBroker =
    enabled && normalizedProvider !== BROKER_PROVIDERS.INTERNAL_PAPER;

  const requestLedgerSync = useCallback(
    async ({ force = false, reason = "reconciliation drift detected" } = {}) => {
      if (!canSyncBroker) {
        return null;
      }

      const hasDrift = shouldAutoSyncReconciliation(reconciliation);
      if (!force && !hasDrift) {
        return null;
      }

      const fingerprint = createSyncFingerprint(
        normalizedProvider,
        reconciliation,
        reason,
        triggerKey
      );
      const now = Date.now();

      if (
        !force &&
        sharedSyncPromise == null &&
        lastAutoSyncFingerprint === fingerprint &&
        now - lastAutoSyncAt < debounceMs
      ) {
        return null;
      }

      if (!force) {
        lastAutoSyncFingerprint = fingerprint;
        lastAutoSyncAt = now;
      }

      return runSharedSync({
        reason,
        provider: normalizedProvider,
        requestSync,
        onSynced: async (result) => {
          await onSyncedRef.current?.(result);
        },
        onFailed: async (error) => {
          await onFailedRef.current?.(error);
        },
      });
    },
    [
      canSyncBroker,
      debounceMs,
      normalizedProvider,
      reconciliation,
      requestSync,
      triggerKey,
    ]
  );

  useEffect(() => {
    if (!canSyncBroker) return;
    if (!shouldAutoSyncReconciliation(reconciliation)) return;
    requestLedgerSync().catch(() => {});
  }, [canSyncBroker, reconciliation, requestLedgerSync]);

  return {
    canAutoSync: canSyncBroker,
    isSyncing: ACTIVE_SYNC_STATES.has(syncState.status),
    requestLedgerSync,
    syncState,
  };
}
