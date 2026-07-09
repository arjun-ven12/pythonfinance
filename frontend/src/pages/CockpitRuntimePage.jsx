import CockpitRuntime from "../features/tradingCockpit/CockpitRuntime";
import AccountStatusPage from "../features/auth/AccountStatusPage";
import LoginRegisterScreen from "../features/auth/LoginRegisterScreen";
import LoadingTerminalScreen from "../features/auth/LoadingTerminalScreen";
import { getFirstAccessibleRoute, isVerifiedUser } from "../features/auth/accessControl";
import useAuth from "../hooks/useAuth";
import { API_BASE_URL } from "../services/apiClient";
import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "tradingDashboardTheme";

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export default function CockpitRuntimePage({ tab = "Dashboard" }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [bootCompleteForUserId, setBootCompleteForUserId] = useState("");
  const {
    error,
    form,
    isAuthenticating,
    isChecked,
    logout,
    mode,
    refreshUser,
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
    if (!user || !isVerifiedUser(user) || bootCompleteForUserId === user.id) return undefined;

    const timer = window.setTimeout(() => {
      setBootCompleteForUserId(user.id);
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [bootCompleteForUserId, user]);

  if (!isChecked || (user && isVerifiedUser(user) && bootCompleteForUserId !== user.id)) {
    return <LoadingTerminalScreen status={!isChecked ? "Checking session" : "Preparing trading desk"} />;
  }

  if (!user) {
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
        onModeChange={(nextMode) => {
          setMode(nextMode);
          window.history.replaceState({}, "", nextMode === "register" ? "/register" : "/login");
        }}
        onSubmit={submit}
        onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        theme={theme}
      />
    );
  }

  if (!isVerifiedUser(user)) {
    return (
      <AccountStatusPage
        onLogout={logout}
        onViewDemo={() => {
          window.history.pushState({}, "", "/demo");
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        status={user.verificationStatus}
        user={user}
      />
    );
  }

  return (
    <CockpitRuntime
      authOverride={{ isChecked: true, refreshUser, user }}
      initialTab={tab || getFirstAccessibleRoute(user)}
    />
  );
}
