export const USER_ROLES = Object.freeze({
  LEVEL_1_USER: "LEVEL_1_USER",
  LEVEL_2_ADMIN: "LEVEL_2_ADMIN",
  LEVEL_3_OWNER_ADMIN: "LEVEL_3_OWNER_ADMIN",
});

export const VERIFICATION_STATUSES = Object.freeze({
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
});

export const PAGE_KEYS = Object.freeze({
  DASHBOARD: "DASHBOARD",
  SCANNER: "SCANNER",
  WATCHLIST: "WATCHLIST",
  STRATEGY_LAB: "STRATEGY_LAB",
  PLAYBOOK: "PLAYBOOK",
  VALIDATION: "VALIDATION",
  BROKER: "BROKER",
  ALERTS: "ALERTS",
  TRADES: "TRADES",
  APPROVALS: "APPROVALS",
  PORTFOLIO: "PORTFOLIO",
  SETTINGS: "SETTINGS",
  ADMIN_DASHBOARD: "ADMIN_DASHBOARD",
});

export const TAB_TO_PAGE_KEY = Object.freeze({
  Dashboard: PAGE_KEYS.DASHBOARD,
  Scanner: PAGE_KEYS.SCANNER,
  Watchlist: PAGE_KEYS.WATCHLIST,
  "Strategy Lab": PAGE_KEYS.STRATEGY_LAB,
  Playbook: PAGE_KEYS.PLAYBOOK,
  Validation: PAGE_KEYS.VALIDATION,
  IBKR: PAGE_KEYS.BROKER,
  Alerts: PAGE_KEYS.ALERTS,
  Trades: PAGE_KEYS.TRADES,
  Approvals: PAGE_KEYS.APPROVALS,
  Portfolio: PAGE_KEYS.PORTFOLIO,
  Settings: PAGE_KEYS.SETTINGS,
  "Admin Dashboard": PAGE_KEYS.ADMIN_DASHBOARD,
});

export const TAB_TO_ROUTE = Object.freeze({
  Dashboard: "/dashboard",
  Scanner: "/scanner",
  Watchlist: "/watchlist",
  Approvals: "/approvals",
  Trades: "/trades",
  Portfolio: "/portfolio",
  Alerts: "/alerts",
  "Strategy Lab": "/strategy-lab",
  Playbook: "/playbook",
  Validation: "/validation",
  IBKR: "/broker",
  Settings: "/settings",
  "Admin Dashboard": "/admin",
});

export function isVerifiedUser(user) {
  return user?.verificationStatus === VERIFICATION_STATUSES.VERIFIED;
}

export function isDemoUser(user) {
  return Boolean(user?.isDemoMode);
}

export function canAccessPage(user, pageKey) {
  if (!user || !isVerifiedUser(user)) {
    return false;
  }

  return Boolean(user.pageAccess?.[pageKey]);
}

export function canAccessTab(user, tab) {
  const pageKey = TAB_TO_PAGE_KEY[tab];
  return pageKey ? canAccessPage(user, pageKey) : false;
}

export function getFirstAccessibleRoute(user) {
  const entry = Object.entries(TAB_TO_ROUTE).find(([tab]) => canAccessTab(user, tab));
  return entry?.[1] || "/dashboard";
}

export function getVisibleTabSections(user, adminMode) {
  const baseSections = [
    {
      label: "Trading",
      tabs: [
        "Dashboard",
        "Scanner",
        "Watchlist",
        "Approvals",
        "Trades",
        "Portfolio",
        "Alerts",
        "Settings",
      ],
    },
    {
      label: "Research",
      tabs: ["Strategy Lab"],
    },
  ];

  const sections = baseSections
    .map((section) => ({
      ...section,
      tabs: section.tabs.filter((tab) => canAccessTab(user, tab)),
    }))
    .filter((section) => section.tabs.length > 0);

  if (
    adminMode &&
    (user?.role === USER_ROLES.LEVEL_2_ADMIN ||
      user?.role === USER_ROLES.LEVEL_3_OWNER_ADMIN)
  ) {
    const adminTabs = ["Playbook", "Validation", { key: "IBKR", label: "Broker Center" }]
      .filter((tab) => canAccessTab(user, typeof tab === "string" ? tab : tab.key));

    if (adminTabs.length > 0) {
      sections.push({
        label: "Admin",
        tabs: adminTabs,
      });
    }
  }

  if (canAccessTab(user, "Admin Dashboard")) {
    sections.push({
      label: "Owner",
      tabs: ["Admin Dashboard"],
    });
  }

  return sections;
}
