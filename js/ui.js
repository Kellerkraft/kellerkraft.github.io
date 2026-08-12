/**
 * Shared UI helpers used across feature modules.
 */
export function showToast(message, type = "info", duration = 3500) {
  const wrap = document.getElementById("toastWrap");
  if (!wrap) return;
  window.__lastToast = { message, type, ts: Date.now() };
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
  el.textContent = message;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, duration);
}

export function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

export function fmt(h, m) {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function minutesLeft(ts) {
  return Math.ceil((ts - Date.now()) / 60000);
}

export function progressPct(data) {
  const total = data.duration * 60000;
  const elapsed = Date.now() - (data.until - total);
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

export const DAYS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
export const DAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = next === "light" ? "☀️" : "🌙";
  const logo = document.getElementById("appLogo");
  if (logo) {
    logo.src = next === "light" ? "./assets/logo-mark-light.png" : "./assets/logo-mark-dark.png";
  }
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", next === "light" ? "#f5f5f5" : "#0a0a0a");
  }
  const statusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (statusBar) {
    statusBar.setAttribute("content", next === "light" ? "default" : "black");
  }
  localStorage.setItem("kg_theme", next);
}

export function initTheme() {
  const saved = localStorage.getItem("kg_theme") || "dark";
  applyTheme(saved);
  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(current);
    });
  }
}
