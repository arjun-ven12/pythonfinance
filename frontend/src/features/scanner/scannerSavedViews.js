const SAVED_VIEW_KEY = "scannerSavedViews";

export function loadSavedScannerViews() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_VIEW_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistSavedScannerViews(views) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SAVED_VIEW_KEY, JSON.stringify(views.slice(0, 6)));
}
