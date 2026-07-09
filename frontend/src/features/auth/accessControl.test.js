import { describe, expect, it } from "vitest";
import {
  canAccessPage,
  getVisibleTabSections,
  PAGE_KEYS,
  USER_ROLES,
  VERIFICATION_STATUSES,
} from "./accessControl";

function createUser(overrides = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    role: USER_ROLES.LEVEL_1_USER,
    verificationStatus: VERIFICATION_STATUSES.VERIFIED,
    pageAccess: {
      [PAGE_KEYS.DASHBOARD]: true,
      [PAGE_KEYS.SCANNER]: true,
      [PAGE_KEYS.WATCHLIST]: true,
      [PAGE_KEYS.STRATEGY_LAB]: true,
      [PAGE_KEYS.PLAYBOOK]: false,
      [PAGE_KEYS.VALIDATION]: false,
      [PAGE_KEYS.BROKER]: false,
      [PAGE_KEYS.ALERTS]: true,
      [PAGE_KEYS.TRADES]: true,
      [PAGE_KEYS.APPROVALS]: true,
      [PAGE_KEYS.PORTFOLIO]: true,
      [PAGE_KEYS.SETTINGS]: true,
      [PAGE_KEYS.ADMIN_DASHBOARD]: false,
    },
    ...overrides,
  };
}

describe("frontend access control", () => {
  it("hides admin dashboard and level 2 admin tabs from level 1 users", () => {
    const sections = getVisibleTabSections(createUser(), true);
    const labels = sections.flatMap((section) =>
      section.tabs.map((tab) => (typeof tab === "string" ? tab : tab.key))
    );

    expect(labels).not.toContain("Playbook");
    expect(labels).not.toContain("Validation");
    expect(labels).not.toContain("Admin Dashboard");
  });

  it("shows restricted tabs only when page access is granted", () => {
    const user = createUser({
      role: USER_ROLES.LEVEL_2_ADMIN,
      pageAccess: {
        ...createUser().pageAccess,
        [PAGE_KEYS.PLAYBOOK]: true,
        [PAGE_KEYS.VALIDATION]: true,
        [PAGE_KEYS.BROKER]: true,
      },
    });
    const sections = getVisibleTabSections(user, true);
    const labels = sections.flatMap((section) =>
      section.tabs.map((tab) => (typeof tab === "string" ? tab : tab.key))
    );

    expect(labels).toContain("Playbook");
    expect(labels).toContain("Validation");
    expect(labels).toContain("IBKR");
  });

  it("denies access for pending users even if page access flags exist", () => {
    const pendingUser = createUser({
      verificationStatus: VERIFICATION_STATUSES.PENDING_VERIFICATION,
    });

    expect(canAccessPage(pendingUser, PAGE_KEYS.DASHBOARD)).toBe(false);
  });
});
