const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|cookie|csrf|api[_-]?key|chatid|brokerpassword|tradepassword|privatekey|websocketkey)/i;
const SENSITIVE_INLINE_PATTERN =
  /\b(authorization|cookie|csrf|token|secret|password|api[_-]?key|chatid|brokerpassword|tradepassword|privatekey|websocketkey)\b\s*[:=]\s*([^,;]+)/gi;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function redactSensitive(value, seen = new WeakSet()) {
  if (value == null) return value;

  if (typeof value === "string") {
    return value.replace(SENSITIVE_INLINE_PATTERN, (_match, label) => `${label}=[REDACTED]`);
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry, seen));
  }

  if (!isPlainObject(value)) {
    return String(value);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? "[REDACTED]"
        : redactSensitive(entryValue, seen),
    ])
  );
}

module.exports = {
  redactSensitive,
};
