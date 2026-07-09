import { useEffect, useState } from "react";
import { getFirstAccessibleRoute } from "../features/auth/accessControl";
import LoginRegisterScreen from "../features/auth/LoginRegisterScreen";
import useAuth from "../hooks/useAuth";
import { API_BASE_URL } from "../services/apiClient";

const THEME_STORAGE_KEY = "tradingDashboardTheme";

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

function getInitialMode() {
  if (typeof window === "undefined") return "login";
  return window.location.pathname.toLowerCase() === "/register" ? "register" : "login";
}

export default function AuthPage() {
  const [theme, setTheme] = useState(getInitialTheme);
  const {
    error,
    form,
    isAuthenticating,
    mode,
    setMode,
    submit,
    updateForm,
    user,
  } = useAuth(API_BASE_URL);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    setMode(getInitialMode());
  }, [setMode]);

  useEffect(() => {
    if (!user) return;
    window.history.replaceState({}, "", getFirstAccessibleRoute(user));
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [user]);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    window.history.replaceState({}, "", nextMode === "register" ? "/register" : "/login");
  };

  return (
    <LoginRegisterScreen
      error={error}
      form={form}
      isLoading={isAuthenticating}
      mode={mode}
      onBack={() => {
        window.history.replaceState({}, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
      onChange={updateForm}
      onModeChange={handleModeChange}
      onSubmit={submit}
      onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      theme={theme}
    />
  );
}
