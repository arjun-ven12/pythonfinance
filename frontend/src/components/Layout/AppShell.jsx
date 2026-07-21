import { useEffect, useMemo, useState } from "react";
import TabNav from "./TabNav";
import {
  BottomActionBar,
  MobileDrawer,
} from "../responsive/ResponsiveLayout";

function flattenTabs(tabSections, tabs) {
  return tabSections.length > 0
    ? tabSections.flatMap((section) => section.tabs || [])
    : tabs;
}

function getTabKey(tab) {
  return typeof tab === "string" ? tab : tab.key;
}

function getTabLabel(tab) {
  return typeof tab === "string" ? tab : tab.label || tab.key;
}

function getUserInitial(user) {
  const value = user?.name || user?.email || "A";
  return String(value).trim().charAt(0).toUpperCase();
}

function getAdminMeta(user) {
  if (user?.role === "LEVEL_3_OWNER_ADMIN") {
    return "Owner controls · Level 3";
  }

  return "Advanced tools · Level 2";
}

function SidebarBrandMark() {
  return (
    <svg aria-hidden="true" className="sidebar-brand-mark" viewBox="0 0 32 32">
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="10" />
      <rect x="8" y="15.5" width="3.5" height="8.5" rx="1.75" />
      <rect x="14.25" y="8" width="3.5" height="16" rx="1.75" />
      <rect x="20.5" y="11.5" width="3.5" height="12.5" rx="1.75" />
    </svg>
  );
}

const SIDEBAR_COLLAPSE_STORAGE_KEY = "quant.sidebarCollapsed";

export default function AppShell({
  activeTab,
  adminMode = false,
  children,
  hideThemeToggle = false,
  logoutLabel = "Log out",
  onLogout,
  onTabChange,
  onThemeToggle,
  tabSections = [],
  tabs = [],
  theme = "dark",
  user,
}) {
  const [isNavDrawerOpen, setIsNavDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const navTabs = useMemo(() => flattenTabs(tabSections, tabs), [tabSections, tabs]);
  const primaryMobileTabs = ["Dashboard", "Scanner", "Approvals", "Portfolio"];
  const bottomTabs = primaryMobileTabs
    .map((tabKey) => navTabs.find((tab) => getTabKey(tab) === tabKey))
    .filter(Boolean);

  const handleTabChange = (tab) => {
    onTabChange(tab);
    setIsNavDrawerOpen(false);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    setIsSidebarCollapsed(storedValue === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <main className={`app app-shell theme-${theme} ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`app-sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-header">
            <div className="sidebar-brand-lockup">
              <SidebarBrandMark />
              <div className="sidebar-brand-copy">
                <strong>Quant&apos;s Trade</strong>
                <p className="eyebrow">Trading Cockpit</p>
              </div>
            </div>
            {!isSidebarCollapsed ? (
              <button
                aria-label="Collapse navigation"
                className="sidebar-collapse-button"
                onClick={() => setIsSidebarCollapsed(true)}
                title="Collapse navigation"
                type="button"
              >
                «
              </button>
            ) : null}
          </div>
          {isSidebarCollapsed ? (
            <button
              aria-label="Expand navigation"
              className="sidebar-collapse-button sidebar-expand-button"
              onClick={() => setIsSidebarCollapsed(false)}
              title="Expand navigation"
              type="button"
            >
              »
            </button>
          ) : null}
          {adminMode ? (
            <div
              aria-label={`Admin mode - ${getAdminMeta(user)}`}
              className="sidebar-admin-card"
              title={isSidebarCollapsed ? `Admin mode - ${getAdminMeta(user)}` : undefined}
            >
              <span className="sidebar-admin-icon" aria-hidden="true" />
              <div className="sidebar-admin-copy">
                <div className="sidebar-admin-title-row">
                  <strong>Admin mode</strong>
                  <span className="sidebar-admin-status-dot" aria-hidden="true" />
                </div>
                <span className="sidebar-admin-meta">{getAdminMeta(user)}</span>
              </div>
            </div>
          ) : null}
        </div>
        <TabNav
          activeTab={activeTab}
          collapsed={isSidebarCollapsed}
          onChange={handleTabChange}
          sections={tabSections}
          tabs={tabs}
        />
        <div className="sidebar-user-panel">
          {!hideThemeToggle ? (
            <button className="theme-toggle sidebar-footer-button" onClick={onThemeToggle} type="button">
              <span className="sidebar-footer-short-label">{theme === "dark" ? "Light" : "Dark"}</span>
              <span className="sidebar-footer-full-label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>
          ) : null}
          <div className="sidebar-user-identity">
            <span className="sidebar-user-avatar">{getUserInitial(user)}</span>
            <span>{user?.email || user?.name || "Signed in"}</span>
          </div>
          <button className="sidebar-logout-button" onClick={onLogout} type="button">
            <span className="sidebar-footer-short-label">Out</span>
            <span className="sidebar-footer-full-label">{logoutLabel}</span>
          </button>
        </div>
      </aside>
      <div className="app-content">{children}</div>
      <BottomActionBar aria-label="Primary mobile navigation" className="mobile-primary-nav">
        {bottomTabs.map((tab) => (
          <button
            className={activeTab === getTabKey(tab) ? "active" : ""}
            key={getTabKey(tab)}
            onClick={() => handleTabChange(getTabKey(tab))}
            type="button"
          >
            {getTabLabel(tab)}
          </button>
        ))}
        <button
          className={isNavDrawerOpen ? "active" : ""}
          onClick={() => setIsNavDrawerOpen(true)}
          type="button"
        >
          More
        </button>
      </BottomActionBar>
      <MobileDrawer
        isOpen={isNavDrawerOpen}
        label="Trading cockpit menu"
        onClose={() => setIsNavDrawerOpen(false)}
      >
        <div className="mobile-drawer-brand">
          <div className="sidebar-brand-lockup">
            <SidebarBrandMark />
            <div className="sidebar-brand-copy">
              <strong>Quant&apos;s Trade</strong>
              <p className="eyebrow">Trading Cockpit</p>
            </div>
          </div>
          {adminMode ? (
            <div className="sidebar-admin-card">
              <span className="sidebar-admin-icon" aria-hidden="true" />
              <div className="sidebar-admin-copy">
                <div className="sidebar-admin-title-row">
                  <strong>Admin mode</strong>
                  <span className="sidebar-admin-status-dot" aria-hidden="true" />
                </div>
                <span className="sidebar-admin-meta">{getAdminMeta(user)}</span>
              </div>
            </div>
          ) : null}
        </div>
        <TabNav
          activeTab={activeTab}
          onChange={handleTabChange}
          sections={tabSections}
          tabs={tabs}
        />
        <div className="sidebar-user-panel">
          {!hideThemeToggle ? (
            <button className="theme-toggle sidebar-footer-button" onClick={onThemeToggle} type="button">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          ) : null}
          <div className="sidebar-user-identity">
            <span className="sidebar-user-avatar">{getUserInitial(user)}</span>
            <span>{user?.email || user?.name || "Signed in"}</span>
          </div>
          <button className="sidebar-logout-button" onClick={onLogout} type="button">
            {logoutLabel}
          </button>
        </div>
      </MobileDrawer>
    </main>
  );
}
