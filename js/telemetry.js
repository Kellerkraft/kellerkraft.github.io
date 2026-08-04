/**
 * Lightweight client telemetry + error tracking (Phase 1).
 * Stores events locally and mirrors to console; optional remote hook later.
 */

const STORAGE_KEY = "kg_telemetry_v1";
const MAX_EVENTS = 200;
const SESSION_ID = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

let enabled = true;
let sessionStartedAt = Date.now();

function readStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      events: Array.isArray(raw.events) ? raw.events : [],
      errors: Array.isArray(raw.errors) ? raw.errors : []
    };
  } catch {
    return { events: [], errors: [] };
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      events: store.events.slice(0, MAX_EVENTS),
      errors: store.errors.slice(0, MAX_EVENTS)
    }));
  } catch {
    // Quota / private mode — ignore
  }
}

function pushItem(kind, item) {
  if (!enabled) return;
  const store = readStore();
  store[kind].unshift(item);
  writeStore(store);
  if (kind === "errors") {
    console.error("[telemetry]", item.name || "error", item.message || item);
  } else if (localStorage.getItem("kg_debug_telemetry") === "1") {
    console.info("[telemetry]", item.name, item.props || {});
  }
}

export function initTelemetry() {
  sessionStartedAt = Date.now();
  trackEvent("session_start", {
    path: location.pathname,
    theme: document.documentElement.getAttribute("data-theme") || "dark"
  });

  window.addEventListener("error", (ev) => {
    trackError(ev.error || new Error(ev.message || "window.error"), {
      source: "window.error",
      filename: ev.filename,
      lineno: ev.lineno
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    const err = reason instanceof Error ? reason : new Error(String(reason || "unhandledrejection"));
    trackError(err, { source: "unhandledrejection" });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      trackEvent("session_heartbeat", {
        durationMs: Date.now() - sessionStartedAt
      });
    }
  });
}

export function trackEvent(name, props = {}) {
  pushItem("events", {
    name: String(name || "event").slice(0, 80),
    props,
    ts: Date.now(),
    sessionId: SESSION_ID
  });
}

export function trackError(error, context = {}) {
  const err = error instanceof Error ? error : new Error(String(error || "Unknown error"));
  pushItem("errors", {
    name: err.name || "Error",
    message: String(err.message || "").slice(0, 500),
    stack: String(err.stack || "").slice(0, 2000),
    context,
    ts: Date.now(),
    sessionId: SESSION_ID
  });
}

export function getTelemetrySnapshot() {
  const store = readStore();
  return {
    sessionId: SESSION_ID,
    sessionStartedAt,
    eventCount: store.events.length,
    errorCount: store.errors.length,
    recentEvents: store.events.slice(0, 20),
    recentErrors: store.errors.slice(0, 20)
  };
}

export function setTelemetryEnabled(value) {
  enabled = Boolean(value);
}

/** Expose for Owner-Debug in console: window.__kgTelemetry */
export function exposeTelemetryGlobal() {
  window.__kgTelemetry = {
    snapshot: getTelemetrySnapshot,
    trackEvent,
    trackError,
    setEnabled: setTelemetryEnabled
  };
}
