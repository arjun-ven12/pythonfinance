import { useState } from "react";
import { syncBrokerOrder } from "../hooks/brokerApi";

const TERMINAL_STATUS_GROUPS = [
  { key: "FILLED", label: "Filled" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "EXPIRED", label: "Expired" },
  { key: "REJECTED", label: "Rejected" },
];

function normalizeStatus(value) {
  return String(value || "UNKNOWN")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function isActiveStatus(value) {
  const status = normalizeStatus(value);
  return !(
    status === "FILLED" ||
    status.includes("CANCEL") ||
    status.includes("EXPIRE") ||
    status.includes("REJECT") ||
    status.includes("FAIL")
  );
}

function getTerminalGroupKey(value) {
  const status = normalizeStatus(value);
  if (status === "FILLED") return "FILLED";
  if (status.includes("CANCEL")) return "CANCELLED";
  if (status.includes("EXPIRE")) return "EXPIRED";
  if (status.includes("REJECT") || status.includes("FAIL")) return "REJECTED";
  return null;
}

function formatPrice(value) {
  if (value == null || value === "") return "Market";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function BrokerOrdersPanel({ orders = [], onRefresh = null }) {
  const [syncingOrderId, setSyncingOrderId] = useState("");
  const [error, setError] = useState("");
  const openOrders = orders.filter((order) => isActiveStatus(order.status));
  const terminalGroups = TERMINAL_STATUS_GROUPS.map((group) => ({
    ...group,
    orders: orders.filter((order) => getTerminalGroupKey(order.status) === group.key),
  })).filter((group) => group.orders.length);

  async function handleRefreshOrder(orderId) {
    if (!orderId) return;
    setSyncingOrderId(orderId);
    setError("");
    try {
      await syncBrokerOrder(orderId);
      await onRefresh?.();
    } catch (syncError) {
      setError(syncError.message || "Unable to refresh broker order.");
    } finally {
      setSyncingOrderId("");
    }
  }

  return (
    <article className="ibkr-card">
      <div className="broker-card-header">
        <div>
          <p className="eyebrow">Broker Orders</p>
          <h3>Broker order status</h3>
        </div>
        <span className="ibkr-status limited">{openOrders.length} open</span>
      </div>
      {error ? <p className="ibkr-note">{error}</p> : null}
      <div className="broker-card-header broker-subtable-header">
        <div>
          <p className="eyebrow">Open Orders</p>
          <h3>Active broker orders</h3>
        </div>
        <span className="ibkr-status limited">{openOrders.length} active</span>
      </div>
      <div className="broker-reconciliation-table">
        <div className="broker-table-head broker-order-grid">
          <span>Symbol</span>
          <span>Side</span>
          <span>Qty</span>
          <span>Type</span>
          <span>Status</span>
          <span>Client ID</span>
          <span>Actions</span>
        </div>
        {openOrders.length ? (
          openOrders.map((order) => (
            <div className="broker-table-row broker-order-grid" key={order.id}>
              <strong>{order.symbol}</strong>
              <span>{order.side}</span>
              <span>{order.quantity}</span>
              <span>
                {order.orderType}
                {order.limitPrice != null ? ` @ ${formatPrice(order.limitPrice)}` : ""}
              </span>
              <span>{order.status}</span>
              <span>{order.clientOrderId || "-"}</span>
              <div className="broker-order-actions">
                <button
                  type="button"
                  onClick={() => handleRefreshOrder(order.id)}
                  disabled={syncingOrderId === order.id}
                >
                  {syncingOrderId === order.id ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="alerts-empty">No active broker orders.</p>
        )}
      </div>
      {terminalGroups.map((group) => (
        <div className="broker-reconciliation-table" key={group.key}>
          <div className="broker-card-header broker-subtable-header">
            <div>
              <p className="eyebrow">Order History</p>
              <h3>{group.label}</h3>
            </div>
            <span className="ibkr-status limited">{group.orders.length}</span>
          </div>
          <div className="broker-table-head broker-order-grid">
            <span>Symbol</span>
            <span>Side</span>
            <span>Qty</span>
            <span>Type</span>
            <span>Status</span>
            <span>Client ID</span>
            <span>Actions</span>
          </div>
          {group.orders.map((order) => (
            <div className="broker-table-row broker-order-grid" key={order.id}>
              <strong>{order.symbol}</strong>
              <span>{order.side}</span>
              <span>{order.quantity}</span>
              <span>
                {order.orderType}
                {order.limitPrice != null ? ` @ ${formatPrice(order.limitPrice)}` : ""}
              </span>
              <span>{order.status}</span>
              <span>{order.clientOrderId || "-"}</span>
              <div className="broker-order-actions">
                <span>-</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </article>
  );
}
