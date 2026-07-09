import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  clearApiSessionState,
  readJson,
} from "../services/apiClient";

const EMPTY_AUTH_FORM = {
  name: "",
  email: "",
  password: "",
};
const LEGACY_AUTH_STORAGE_KEYS = [
  "tradingDashboardUserId",
  "tradingDashboardAccessToken",
  "tradingDashboardJwt",
];

export default function useAuth(apiBaseUrl, options = {}) {
  const { skipInitialSessionCheck = false } = options;
  const [user, setUser] = useState(null);
  const [mode, setModeState] = useState("login");
  const [form, setForm] = useState(EMPTY_AUTH_FORM);
  const [error, setError] = useState("");
  const [isChecked, setIsChecked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const clearSession = useCallback((message = "") => {
    LEGACY_AUTH_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
    });
    clearApiSessionState();
    window.dispatchEvent(new CustomEvent("trading-dashboard:logout"));
    setUser(null);
    setError(message);
    setIsChecked(true);
  }, []);

  const logout = useCallback(
    async (message = "") => {
      try {
        await apiFetch(`${apiBaseUrl}/api/auth/logout`, {
          method: "POST",
          skipAuthRefresh: true,
        });
      } finally {
        clearSession(message);
      }
    },
    [apiBaseUrl, clearSession]
  );

  const refreshUser = useCallback(async () => {
    const result = await apiFetch(`${apiBaseUrl}/api/auth/me`, {
      skipAuthRefresh: true,
    }).then(readJson);

    setUser(result.user);
    return result.user;
  }, [apiBaseUrl]);

  useEffect(() => {
    const handleAuthExpired = () => {
      const pathname = window.location.pathname.toLowerCase();
      const onAuthScreen = pathname === "/login" || pathname === "/register";

      if (onAuthScreen && !user) {
        clearSession("");
        return;
      }

      if (!user) {
        clearSession("");
        return;
      }

      clearSession("Your session expired. Sign in again.");
      window.history.replaceState({}, "", "/");
    };

    window.addEventListener("trading-dashboard:auth-expired", handleAuthExpired);
    return () => {
      window.removeEventListener("trading-dashboard:auth-expired", handleAuthExpired);
    };
  }, [clearSession, user]);

  useEffect(() => {
    if (skipInitialSessionCheck) {
      setIsChecked(true);
      return undefined;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const result = await refreshUser();
        if (!cancelled) {
          setUser(result);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setError("");
        }
      } finally {
        if (!cancelled) {
          setIsChecked(true);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [refreshUser, skipInitialSessionCheck]);

  const updateForm = useCallback((field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }, []);

  const setMode = useCallback((nextMode) => {
    setModeState(nextMode);
    setError("");
  }, []);

  const submit = useCallback(
    async (event) => {
      event.preventDefault();
      setIsAuthenticating(true);
      setError("");

      try {
        const endpoint = mode === "register" ? "register" : "login";
        const body =
          mode === "register"
            ? form
            : { email: form.email, password: form.password };
        const response = await apiFetch(`${apiBaseUrl}/api/auth/${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          skipAuthRefresh: true,
        });
        const result = await readJson(response);

        setUser(result.user);
        setForm({
          ...EMPTY_AUTH_FORM,
          email: result.user?.email || form.email,
        });
        setIsChecked(true);
      } catch (submitError) {
        setError(submitError.message);
      } finally {
        setIsAuthenticating(false);
      }
    },
    [apiBaseUrl, form, mode]
  );

  return {
    error,
    form,
    isAuthenticating,
    isChecked,
    logout,
    mode,
    setMode,
    submit,
    updateForm,
    user,
    refreshUser,
    setUser,
  };
}
