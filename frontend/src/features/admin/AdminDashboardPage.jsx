import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL, apiFetch, readJson } from "../../services/apiClient";
import { PAGE_KEYS, USER_ROLES } from "../auth/accessControl";
import AiCostDashboard from "./AiCostDashboard";
import "./admin.css";

const PAGE_LABELS = {
  [PAGE_KEYS.DASHBOARD]: "Dashboard",
  [PAGE_KEYS.SCANNER]: "Scanner",
  [PAGE_KEYS.WATCHLIST]: "Watchlist",
  [PAGE_KEYS.STRATEGY_LAB]: "Strategy Lab",
  [PAGE_KEYS.PLAYBOOK]: "Playbook",
  [PAGE_KEYS.VALIDATION]: "Validation",
  [PAGE_KEYS.BROKER]: "Broker",
  [PAGE_KEYS.ALERTS]: "Alerts",
  [PAGE_KEYS.TRADES]: "Trades",
  [PAGE_KEYS.APPROVALS]: "Approvals",
  [PAGE_KEYS.PORTFOLIO]: "Portfolio",
  [PAGE_KEYS.SETTINGS]: "Settings",
  [PAGE_KEYS.ADMIN_DASHBOARD]: "Admin Dashboard",
};

const EDITABLE_PAGE_KEYS = Object.values(PAGE_KEYS).filter(
  (pageKey) => pageKey !== PAGE_KEYS.ADMIN_DASHBOARD
);
const USERS_PER_PAGE = 10;

async function patchJson(url, body) {
  const response = await apiFetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return readJson(response);
}

function summarizeAccess(pageAccess = {}) {
  const enabled = Object.entries(pageAccess)
    .filter(([, allowed]) => allowed)
    .map(([pageKey]) => PAGE_LABELS[pageKey] || pageKey);

  if (enabled.length === 0) {
    return "No page access";
  }

  return enabled.slice(0, 3).join(", ") + (enabled.length > 3 ? ` +${enabled.length - 3}` : "");
}

function getDemotionTargetRole(role) {
  if (role === USER_ROLES.LEVEL_3_OWNER_ADMIN) {
    return USER_ROLES.LEVEL_2_ADMIN;
  }

  if (role === USER_ROLES.LEVEL_2_ADMIN) {
    return USER_ROLES.LEVEL_1_USER;
  }

  return USER_ROLES.LEVEL_1_USER;
}

function getDemotionLabel(role) {
  if (role === USER_ROLES.LEVEL_3_OWNER_ADMIN) {
    return "Demote to Level 2";
  }

  if (role === USER_ROLES.LEVEL_2_ADMIN) {
    return "Demote to Level 1";
  }

  return "Already Level 1";
}

export default function AdminDashboardPage({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [marketDataMetrics, setMarketDataMetrics] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pageAccess, setPageAccess] = useState({});
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [selectedUserId, users]
  );
  const demotionTargetRole = getDemotionTargetRole(selectedUser?.role);
  const demotionLabel = getDemotionLabel(selectedUser?.role);
  const demotionDisabled = !selectedUser || selectedUser.role === USER_ROLES.LEVEL_1_USER;
  const filteredUsers = useMemo(() => {
    const normalizedSearch = userSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return users;
    }

    return users.filter((user) =>
      String(user.email || "").toLowerCase().includes(normalizedSearch)
    );
  }, [userSearch, users]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const effectivePage = Math.min(currentPage, totalPages);
  const paginatedUsers = useMemo(() => {
    const startIndex = (effectivePage - 1) * USERS_PER_PAGE;
    return filteredUsers.slice(startIndex, startIndex + USERS_PER_PAGE);
  }, [effectivePage, filteredUsers]);

  const fetchUsers = useCallback(async () => {
    const result = await apiFetch(`${API_BASE_URL}/api/admin/users`).then(readJson);
    return result.users || [];
  }, []);

  const fetchLogs = useCallback(async () => {
    const result = await apiFetch(`${API_BASE_URL}/api/admin/audit-logs`).then(readJson);
    return result.logs || [];
  }, []);

  const fetchMarketDataMetrics = useCallback(async () => {
    const result = await apiFetch(`${API_BASE_URL}/api/admin/market-data-metrics`).then(readJson);
    return result.metrics || null;
  }, []);

  const fetchPageAccess = useCallback(async (userId) => {
    if (!userId) return {};
    const result = await apiFetch(`${API_BASE_URL}/api/admin/users/${userId}/page-access`).then(readJson);
    return result.pageAccess || {};
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setError("");
      const loadedUsers = await fetchUsers();
      const nextSelectedUserId = selectedUserId || loadedUsers[0]?.id || "";
      const [loadedLogs, loadedPageAccess, loadedMetrics] = await Promise.all([
        fetchLogs(),
        fetchPageAccess(nextSelectedUserId),
        fetchMarketDataMetrics(),
      ]);

      setUsers(loadedUsers);
      setLogs(loadedLogs);
      setPageAccess(loadedPageAccess);
      setMarketDataMetrics(loadedMetrics);
      if (!selectedUserId && nextSelectedUserId) {
        setSelectedUserId(nextSelectedUserId);
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [fetchLogs, fetchMarketDataMetrics, fetchPageAccess, fetchUsers, selectedUserId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const loadedUsers = await fetchUsers();
        const nextSelectedUserId = selectedUserId || loadedUsers[0]?.id || "";
        const [loadedLogs, loadedPageAccess, loadedMetrics] = await Promise.all([
          fetchLogs(),
          fetchPageAccess(nextSelectedUserId),
          fetchMarketDataMetrics(),
        ]);

        if (cancelled) {
          return;
        }

        setUsers(loadedUsers);
        setLogs(loadedLogs);
        setPageAccess(loadedPageAccess);
        setMarketDataMetrics(loadedMetrics);
        if (!selectedUserId && nextSelectedUserId) {
          setSelectedUserId(nextSelectedUserId);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [fetchLogs, fetchMarketDataMetrics, fetchPageAccess, fetchUsers, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) {
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const nextPageAccess = await fetchPageAccess(selectedUserId);
        if (!cancelled) {
          setPageAccess(nextPageAccess);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [fetchPageAccess, selectedUserId]);

  const runAction = useCallback(
    async (action, userId, body = undefined) => {
      try {
        setError("");
        setStatusMessage("");
        await patchJson(`${API_BASE_URL}/api/admin/users/${userId}/${action}`, body);
        await refreshAll();
        setStatusMessage("Change saved.");
      } catch (requestError) {
        setError(requestError.message);
      }
    },
    [refreshAll]
  );

  const handleRoleChange = useCallback(
    async (userId, role) => {
      try {
        setError("");
        setStatusMessage("");
        await patchJson(`${API_BASE_URL}/api/admin/users/${userId}/role`, { role });
        await refreshAll();
        setStatusMessage("Role updated.");
      } catch (requestError) {
        setError(requestError.message);
      }
    },
    [refreshAll]
  );

  const handlePageAccessSave = useCallback(async () => {
    try {
      setError("");
      setStatusMessage("");
      await patchJson(`${API_BASE_URL}/api/admin/users/${selectedUserId}/page-access`, {
        pageAccess: Object.entries(pageAccess).map(([pageKey, allowed]) => ({
          pageKey,
          allowed,
          reason: allowed ? "Granted from Admin Dashboard" : "Restricted from Admin Dashboard",
        })),
      });
      await refreshAll();
      setStatusMessage("Page access updated.");
    } catch (requestError) {
      setError(requestError.message);
    }
  }, [pageAccess, refreshAll, selectedUserId]);

  return (
    <section className="admin-dashboard">
      <header className="admin-dashboard__header">
        <div>
          <p className="eyebrow">Owner controls</p>
          <h2>Admin Dashboard</h2>
          <p>Manual verification, role control, page access, and audit history for the cockpit.</p>
        </div>
        <div className="admin-dashboard__meta">
          <strong>{currentUser?.email}</strong>
          <span>{currentUser?.role === USER_ROLES.LEVEL_3_OWNER_ADMIN ? "Level 3 owner admin" : "Restricted"}</span>
        </div>
      </header>

      {error ? <div className="admin-dashboard__banner error">{error}</div> : null}
      {statusMessage ? <div className="admin-dashboard__banner success">{statusMessage}</div> : null}

      <AiCostDashboard />

      <div className="admin-dashboard__layout">
        <section className="admin-dashboard__panel">
          <div className="admin-dashboard__panel-head">
            <div>
              <h3>Users</h3>
              <span>{filteredUsers.length} matched</span>
            </div>
            <div className="admin-dashboard__table-tools">
              <input
                aria-label="Search users by email"
                className="admin-dashboard__search"
                onChange={(event) => {
                  setUserSearch(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search email"
                type="search"
                value={userSearch}
              />
            </div>
          </div>
          <div className="admin-dashboard__table-wrap">
            <table className="admin-dashboard__table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last login</th>
                  <th>Page access</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((user) => (
                  <tr
                    className={user.id === selectedUserId ? "selected" : ""}
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.verificationStatus}</td>
                    <td>{new Date(user.createdAt).toLocaleString()}</td>
                    <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td>
                    <td>{summarizeAccess(user.pageAccess)}</td>
                  </tr>
                ))}
                {paginatedUsers.length === 0 ? (
                  <tr>
                    <td className="admin-dashboard__table-empty" colSpan={6}>
                      No users matched that email search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="admin-dashboard__pagination">
            <span>
              Page {effectivePage} of {totalPages}
            </span>
            <div className="admin-dashboard__pagination-actions">
              <button
                disabled={effectivePage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                disabled={effectivePage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="admin-dashboard__panel">
          <div className="admin-dashboard__panel-head">
            <h3>User Actions</h3>
            <span>{selectedUser?.email || "Select a user"}</span>
          </div>
          {selectedUser ? (
            <>
              <div className="admin-dashboard__actions">
                <button onClick={() => runAction("verify", selectedUser.id)} type="button">Verify</button>
                <button onClick={() => runAction("reject", selectedUser.id, { reason: "Rejected by owner admin" })} type="button">Reject</button>
                <button onClick={() => runAction("suspend", selectedUser.id, { reason: "Suspended by owner admin" })} type="button">Suspend</button>
                <button onClick={() => handleRoleChange(selectedUser.id, USER_ROLES.LEVEL_2_ADMIN)} type="button">Promote to Level 2</button>
                <button onClick={() => handleRoleChange(selectedUser.id, USER_ROLES.LEVEL_3_OWNER_ADMIN)} type="button">Promote to Level 3</button>
                <button
                  disabled={demotionDisabled}
                  onClick={() => handleRoleChange(selectedUser.id, demotionTargetRole)}
                  type="button"
                >
                  {demotionLabel}
                </button>
              </div>

              <div className="admin-dashboard__page-access">
                <div className="admin-dashboard__section-copy">
                  <h4>Page access</h4>
                  <p>Grant or restrict cockpit areas for this user. Changes take effect on the next API request.</p>
                </div>
                <div className="admin-dashboard__page-grid">
                  {EDITABLE_PAGE_KEYS.map((pageKey) => (
                    <label className="admin-dashboard__access-tile" key={pageKey}>
                      <input
                        checked={Boolean(pageAccess[pageKey])}
                        onChange={(event) =>
                          setPageAccess((current) => ({
                            ...current,
                            [pageKey]: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span className="admin-dashboard__access-check" aria-hidden="true">
                        {pageAccess[pageKey] ? "✓" : ""}
                      </span>
                      <span className="admin-dashboard__access-copy">
                        <strong>{PAGE_LABELS[pageKey]}</strong>
                        <small>{pageAccess[pageKey] ? "Allowed" : "Restricted"}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <button className="admin-dashboard__save" onClick={handlePageAccessSave} type="button">
                  Save page access
                </button>
              </div>
            </>
          ) : (
            <p>Select a user to manage verification, role, and page access.</p>
          )}
        </section>
      </div>

      <section className="admin-dashboard__panel">
        <div className="admin-dashboard__panel-head">
          <div>
            <h3>Market Data Cache</h3>
            <span>Shared cache, Redis coordination, provider pressure, and websocket activity.</span>
          </div>
        </div>
        <div className="admin-dashboard__metrics-grid">
          {[
            ["Memory hits", marketDataMetrics?.counters?.memoryHits ?? 0],
            ["Memory misses", marketDataMetrics?.counters?.memoryMisses ?? 0],
            ["Redis hits", marketDataMetrics?.counters?.redisHits ?? 0],
            ["Redis misses", marketDataMetrics?.counters?.redisMisses ?? 0],
            ["Provider requests", marketDataMetrics?.counters?.providerRequests ?? 0],
            ["Deduped refreshes", marketDataMetrics?.counters?.dedupedRequests ?? 0],
            ["Stale cache reads", marketDataMetrics?.counters?.staleCacheCount ?? 0],
            ["Memory entries", marketDataMetrics?.cache?.memoryEntries ?? 0],
            ["Redis enabled", marketDataMetrics?.cache?.redisEnabled ? "Yes" : "No"],
            ["Subscribers", marketDataMetrics?.gauges?.websocketSubscribers ?? 0],
            ["Quote topics", marketDataMetrics?.gauges?.quoteSubscriptions ?? 0],
            ["History topics", marketDataMetrics?.gauges?.historySubscriptions ?? 0],
            ["Last batch size", marketDataMetrics?.gauges?.lastBatchSize ?? 0],
            ["Avg batch size", marketDataMetrics?.gauges?.averageBatchSize ?? 0],
            ["Last flush", marketDataMetrics?.gauges?.lastFlushAt ? new Date(marketDataMetrics.gauges.lastFlushAt).toLocaleString() : "Never"],
            ["Flushed rows", marketDataMetrics?.gauges?.flushedRows ?? 0],
          ].map(([label, value]) => (
            <article className="admin-dashboard__metric-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <div className="admin-dashboard__latency-list">
          {(marketDataMetrics?.providerLatency || []).map((provider) => (
            <div className="admin-dashboard__latency-row" key={provider.provider}>
              <strong>{provider.provider}</strong>
              <span>{provider.averageLatencyMs} ms avg</span>
              <span>{provider.lastLatencyMs} ms last</span>
              <span>{provider.sampleCount} samples</span>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-dashboard__panel">
        <div className="admin-dashboard__panel-head">
          <div>
            <h3>Audit Trail</h3>
            <span>{logs.length} recent events</span>
          </div>
          <button
            className="admin-dashboard__collapse"
            onClick={() => setIsAuditOpen((current) => !current)}
            type="button"
          >
            {isAuditOpen ? "Hide" : "Show"}
          </button>
        </div>
        {isAuditOpen ? (
          <div className="admin-dashboard__audit-list">
            {logs.map((log) => (
              <div className="admin-dashboard__audit-item" key={log.id}>
                <div className="admin-dashboard__audit-topline">
                  <strong>{log.action.replaceAll("_", " ")}</strong>
                  <small>{new Date(log.createdAt).toLocaleString()}</small>
                </div>
                <span>{log.actorUser?.email || "Unknown actor"} → {log.targetUser?.email || "System"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-dashboard__audit-empty">Audit trail collapsed.</div>
        )}
      </section>
    </section>
  );
}
