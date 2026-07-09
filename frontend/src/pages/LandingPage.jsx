import { useEffect, useState } from "react";
import LandingPageView from "../landing/LandingPage";

const THEME_STORAGE_KEY = "tradingDashboardTheme";

function getInitialTheme() {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

export default function LandingPage() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const navigateTo = (path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <LandingPageView
      onDemo={() => navigateTo("/demo")}
      onLogin={() => navigateTo("/login")}
      onRegister={() => navigateTo("/register")}
      onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      theme={theme}
    />
  );
}
