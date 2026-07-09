import { useState } from "react";

function getTabKey(tab) {
  return typeof tab === "string" ? tab : tab.key;
}

function getTabLabel(tab) {
  return typeof tab === "string" ? tab : tab.label || tab.key;
}

function getTabShortLabel(tab) {
  if (typeof tab !== "string" && tab?.shortLabel) {
    return tab.shortLabel;
  }
  const label = getTabLabel(tab);
  const words = String(label)
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= 1) {
    return String(label).slice(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

function getTabIcon(tab) {
  const key = String(getTabKey(tab) || "").toLowerCase();
  const iconMap = {
    dashboard: "grid",
    scanner: "scan",
    watchlist: "bookmark",
    approvals: "shield",
    trades: "arrows",
    portfolio: "briefcase",
    alerts: "bell",
    settings: "gear",
    "strategy lab": "flask",
    playbook: "book",
    validation: "check",
    broker: "plug",
    "admin dashboard": "crown",
  };
  return iconMap[key] || "dot";
}

export default function TabNav({ activeTab, collapsed = false, onChange, sections = [], tabs = [] }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeTabLabel =
    [...sections.flatMap((section) => section.tabs || []), ...tabs]
      .find((tab) => getTabKey(tab) === activeTab);

  const handleChange = (tab) => {
    onChange(getTabKey(tab));
    setIsMenuOpen(false);
  };

  return (
    <div className="tabs-shell">
      <button
        aria-controls="dashboard-tabs-menu"
        aria-expanded={isMenuOpen}
        className="tabs-menu-toggle"
        onClick={() => setIsMenuOpen((current) => !current)}
        type="button"
      >
        <span>{activeTabLabel ? getTabLabel(activeTabLabel) : activeTab}</span>
        <b>{isMenuOpen ? "Close" : "Menu"}</b>
      </button>
      <nav
        aria-label="Trading dashboard sections"
        className={`tabs-nav ${isMenuOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}
        id="dashboard-tabs-menu"
      >
        {sections.length > 0
          ? sections.map((section) => (
              <div className="tabs-section" key={section.label}>
                <span className="tabs-section-label">{section.label}</span>
                {(section.tabs || []).map((tab) => (
                  <button
                    className={activeTab === getTabKey(tab) ? "active" : ""}
                    data-tab-icon={getTabIcon(tab)}
                    key={getTabKey(tab)}
                    onClick={() => handleChange(tab)}
                    title={getTabLabel(tab)}
                    type="button"
                  >
                    <span className={`tab-icon tab-icon-${getTabIcon(tab)}`} aria-hidden="true" />
                    <span className="tab-short-label">{getTabShortLabel(tab)}</span>
                    <span className="tab-full-label">{getTabLabel(tab)}</span>
                  </button>
                ))}
              </div>
            ))
          : tabs.map((tab) => (
              <button
                className={activeTab === getTabKey(tab) ? "active" : ""}
                data-tab-icon={getTabIcon(tab)}
                key={getTabKey(tab)}
                onClick={() => handleChange(tab)}
                title={getTabLabel(tab)}
                type="button"
              >
                <span className={`tab-icon tab-icon-${getTabIcon(tab)}`} aria-hidden="true" />
                <span className="tab-short-label">{getTabShortLabel(tab)}</span>
                <span className="tab-full-label">{getTabLabel(tab)}</span>
              </button>
            ))}
      </nav>
    </div>
  );
}
