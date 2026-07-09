export default function formatJsonSummary(value, fallback = "None") {
  if (!value) {
    return fallback;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return fallback;
    }

    return value
      .slice(0, 3)
      .map((item) => {
        if (typeof item === "string") return item;
        return item.title || item.reason || item.event_type || JSON.stringify(item);
      })
      .join("; ");
  }

  if (typeof value === "object") {
    return (
      value.news_summary ||
      value.reasoning ||
      value.summary ||
      value.risk_level ||
      JSON.stringify(value)
    );
  }

  return String(value);
}
