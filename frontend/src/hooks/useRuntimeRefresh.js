import { useEffect } from "react";

export default function useRuntimeRefresh({
  enabled,
  isScanning,
  onAutoRefresh,
  onEngineRefresh,
  onPortfolioRefresh,
  onSafetyRefresh,
  user,
}) {
  useEffect(() => {
    if (!user || !enabled) return undefined;
    const intervalId = window.setInterval(() => {
      if (!isScanning) onAutoRefresh?.();
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, [enabled, isScanning, onAutoRefresh, user]);

  useEffect(() => {
    if (!user) return undefined;
    const intervalId = window.setInterval(() => {
      onEngineRefresh?.();
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [onEngineRefresh, user]);

  useEffect(() => {
    if (!user) return undefined;
    const intervalId = window.setInterval(() => {
      onSafetyRefresh?.();
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [onSafetyRefresh, user]);

  useEffect(() => {
    if (!user) return undefined;
    const intervalId = window.setInterval(() => {
      onPortfolioRefresh?.();
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [onPortfolioRefresh, user]);
}
