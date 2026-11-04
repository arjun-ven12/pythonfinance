export type Data = Record<string, unknown>;
export const object = (value: unknown): Data =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Data)
    : {};
export const list = (value: unknown): Data[] =>
  Array.isArray(value) ? value.map(object) : [];
export const rows = (
  value: unknown,
  keys: string[] = ["items", "data", "results", "rows"],
): Data[] => {
  if (Array.isArray(value)) return list(value);
  const data = object(value);
  for (const key of keys) if (Array.isArray(data[key])) return list(data[key]);
  return [];
};
export function number(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function money(value: unknown, currency = "USD") {
  const n = number(value);
  if (n === null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return "—";
  }
}
export const text = (value: unknown, fallback = "—"): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
export const percent = (value: unknown) =>
  number(value) === null
    ? "—"
    : `${number(value)! > 0 ? "+" : ""}${number(value)!.toFixed(2)}%`;
export function ago(value: unknown) {
  const n = Date.parse(text(value));
  if (!Number.isFinite(n)) return "Not reported";
  const seconds = Math.max(0, Math.floor((Date.now() - n) / 1000));
  return seconds < 60
    ? `${seconds}s ago`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : `${Math.floor(seconds / 3600)}h ago`;
}
export const isStale = (timestamp: unknown, age = 30000) =>
  !Number.isFinite(Date.parse(text(timestamp))) ||
  Date.now() - Date.parse(text(timestamp)) > age ||
  Date.parse(text(timestamp)) > Date.now() + 1000;
export function positions(data: unknown): Data[] {
  const p = object(data).positions;
  return Array.isArray(p)
    ? list(p)
    : Object.entries(object(p)).map(([symbol, value]) => ({
        symbol,
        ...object(value),
      }));
}
export function safeNotificationPath(data: unknown): string | null {
  const path = object(data).path;
  return typeof path === "string" &&
    (/^\/(automation|alerts|portfolio|strategies)$/.test(path) ||
      /^\/symbol\/[A-Z0-9.^=_-]{1,32}$/.test(path))
    ? path
    : null;
}
export function reportText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map(reportText).filter(Boolean).join("\n\n");
  const data = object(value);
  for (const key of [
    "answer",
    "response",
    "content",
    "summary",
    "message",
    "analysis",
    "report",
    "result",
  ])
    if (data[key]) return reportText(data[key]);
  return Object.entries(data)
    .filter(([key]) => !["metadata", "usage", "raw", "requestId"].includes(key))
    .map(([key, v]) => `${key.replace(/_/g, " ")}\n${reportText(v)}`)
    .join("\n\n");
}
export function quotePrice(value: unknown, symbol: string, payload: unknown) {
  const data = object(payload),
    q = object(data.quote),
    n = number(value);
  if (n === null) return "—";
  const market = text(data.market, "");
  const currency = text(
    q.currency ?? data.currency,
    market === "US"
      ? "USD"
      : market === "SG" || market === "SGX" || symbol.endsWith(".SI")
        ? "SGD"
        : "",
  );
  return currency
    ? money(n, currency)
    : n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
