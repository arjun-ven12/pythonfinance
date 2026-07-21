import { Suspense, lazy, useEffect, useMemo, useState } from "react";

const ROUTES = {
  "/login": lazy(() => import("../../pages/AuthPage")),
  "/register": lazy(() => import("../../pages/AuthPage")),
  "/demo": lazy(() => import("../../pages/DemoPage")),
  "/demo/scanner": lazy(() => import("../../pages/DemoPage")),
  "/demo/strategy": lazy(() => import("../../pages/DemoPage")),
  "/demo/approvals": lazy(() => import("../../pages/DemoPage")),
  "/demo/portfolio": lazy(() => import("../../pages/DemoPage")),
  "/demo/validation": lazy(() => import("../../pages/DemoPage")),
  "/demo/playbook": lazy(() => import("../../pages/DemoPage")),
  "/": lazy(() => import("../../pages/LandingPage")),
  "/dashboard": lazy(() => import("../../pages/DashboardPage")),
  "/scanner": lazy(() => import("../../pages/ScannerPage")),
  "/approvals": lazy(() => import("../../pages/ApprovalsPage")),
  "/portfolio": lazy(() => import("../../pages/PortfolioPage")),
  "/research": lazy(() => import("../../pages/ResearchPage")),
  "/strategy-lab": lazy(() => import("../../pages/StrategyLabPage")),
  "/validation": lazy(() => import("../../pages/ValidationPage")),
  "/playbook": lazy(() => import("../../pages/PlaybookPage")),
  "/alerts": lazy(() => import("../../pages/AlertsPage")),
  "/settings": lazy(() => import("../../pages/SettingsPage")),
  "/admin": lazy(() => import("../../pages/AdminDashboardPage")),
  "/broker": lazy(() => import("../../pages/BrokerPage")),
  "/ibkr": lazy(() => import("../../pages/BrokerPage")),
  "/responsive-audit": lazy(() => import("../../pages/ResponsiveAuditPage")),
};

function getRoutePath() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.pathname || "/";
}

export default function TradingCockpitApp() {
  const [routePath, setRoutePath] = useState(getRoutePath);

  useEffect(() => {
    const handlePopState = () => setRoutePath(getRoutePath());

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const Page = useMemo(() => ROUTES[routePath] || ROUTES["/"], [routePath]);

  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
