import { useState } from "react";

function getTabKey(tab) {
  return typeof tab === "string" ? tab : tab.key;
}

function getTabLabel(tab) {
  return typeof tab === "string" ? tab : tab.label || tab.key;
}

function getTabIcon(tab) {
  return typeof tab === "string" ? null : tab?.icon || null;
}

function NavButton({ active, collapsed, onClick, tab }) {
  const label = getTabLabel(tab);
  const Icon = getTabIcon(tab);

  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={active ? "active" : ""}
      onClick={onClick}
      title={label}
      type="button"
    >
      {collapsed ? (
        Icon ? (
          <span className="tab-icon" aria-hidden="true">
            <Icon size={18} strokeWidth={1.75} />
          </span>
        ) : null
      ) : (
        <>
          {Icon ? (
            <span className="tab-icon" aria-hidden="true">
              <Icon size={18} strokeWidth={1.75} />
            </span>
          ) : null}
          <span className="tab-full-label">{label}</span>
        </>
      )}
    </button>
  );
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
                  <NavButton
                    active={activeTab === getTabKey(tab)}
                    collapsed={collapsed}
                    key={getTabKey(tab)}
                    onClick={() => handleChange(tab)}
                    tab={tab}
                  />
                ))}
              </div>
            ))
          : tabs.map((tab) => (
              <NavButton
                active={activeTab === getTabKey(tab)}
                collapsed={collapsed}
                key={getTabKey(tab)}
                onClick={() => handleChange(tab)}
                tab={tab}
              />
            ))}
      </nav>
    </div>
  );
}
