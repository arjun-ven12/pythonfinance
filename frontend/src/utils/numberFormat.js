const NUMERIC_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function formatNumber(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;

  const rounded = Math.round((number + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

export function formatNumericValue(value, fallback = "-") {
  if (typeof value === "number") return formatNumber(value, fallback);
  if (typeof value === "string" && NUMERIC_TEXT.test(value.trim())) {
    return formatNumber(value, fallback);
  }
  return value ?? fallback;
}

export function formatPercent(value, { scale = 1, fallback = "-" } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return `${formatNumber(number * scale, fallback)}%`;
}

export function formatCurrency(value, currency = "USD", fallback = "-") {
  const formatted = formatNumber(value, fallback);
  return formatted === fallback ? `${currency} ${fallback}` : `${currency} ${formatted}`;
}
