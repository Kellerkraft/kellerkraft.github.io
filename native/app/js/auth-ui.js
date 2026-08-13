/**
 * Auth account panel UI — email/password (+ guest).
 */
import {
  getAuthSnapshot,
  onAuthChange,
  registerWithEmailPassword,
  signInWithEmailPassword,
  resetPassword,
  signOutToGuest
} from "./auth.js";
import { trackEvent, trackError } from "./telemetry.js";

/**
 * @param {object} deps
 * @param {(msg: string, type?: string, duration?: number) => void} deps.showToast
 * @param {(snap: object) => void} [deps.onAuthUiChange]
 * @param {() => string} [deps.getTrainingUser]
 * @param {(snap: object) => void|Promise<void>} [deps.onLinked]
 */
export function initAuthPanel(deps) {
  const mount = document.getElementById("authPanel");
  if (!mount) return () => {};

  let busy = false;

  function render(snap) {
    const permanent = snap.isPermanent;
    const trainingName = (deps.getTrainingUser?.() || "").trim();
    const label = permanent
      ? (snap.email || "Konto")
      : "Gast (anonym)";

    if (permanent) {
      mount.innerHTML = `
        <div class="auth-card">
          <div class="auth-status">
            <span class="auth-label">Angemeldet</span>
            <span class="auth-value">${escapeHtml(label)}</span>
            ${trainingName ? `<span class="auth-training-name">Trainingsprofil: <strong>${escapeHtml(trainingName)}</strong></span>` : ""}
          </div>
          <div class="sub auth-hint">Dein Konto ist mit dem Trainingsprofil verknüpft — gleicher Name für Logs, Streaks und Auszeichnung.</div>
          <button type="button" class="btn-main btn-dark" id="authSignOutBtn">Abmelden (weiter als Gast)</button>
        </div>
      `;
    } else {
      mount.innerHTML = `
        <button type="button" class="exercise-details-toggle" id="authToggleBtn" style="width:100%;text-align:left;padding:8px 0">
          ▸ Anmelden / Registrieren
        </button>
        <div id="authCollapsible" class="exercise-details-collapsible">
          <div class="auth-card" style="margin-top:8px">
            <div class="auth-status">
              <span class="auth-label">Gastmodus</span>
              <span class="auth-value">${escapeHtml(label)}</span>
              ${trainingName ? `<span class="auth-training-name">Trainingsprofil: <strong>${escapeHtml(trainingName)}</strong></span>` : ""}
            </div>
            <div class="field-label">Konto (E-Mail + Passwort)</div>
            <form id="authForm" autocomplete="on">
              <input id="authEmailInput" class="name-input" type="email" name="username" placeholder="name@example.com" autocomplete="username" required>
              <input id="authPasswordInput" class="name-input" type="password" name="password" placeholder="Passwort (min. 6 Zeichen)" autocomplete="current-password" required minlength="6" style="margin-top:8px">
              <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
                <button type="submit" class="btn-main btn-lime" id="authSignInBtn" style="flex:1;min-width:120px">Anmelden</button>
                <button type="button" class="btn-main btn-dark" id="authRegisterBtn" style="flex:1;min-width:120px">Registrieren</button>
              </div>
            </form>
            <button type="button" class="owner-link" id="authResetBtn" style="margin-top:10px">Passwort vergessen / setzen</button>
            <div class="sub auth-hint">Zugangsdaten im Passwort-Manager speichern. Bleibt in diesem Browser angemeldet.</div>
          </div>
        </div>
      `;
      document.getElementById("authToggleBtn")?.addEventListener("click", () => {
        const panel = document.getElementById("authCollapsible");
        const btn = document.getElementById("authToggleBtn");
        const isOpen = panel.classList.contains("open");
        panel.classList.toggle("open", !isOpen);
        btn.textContent = isOpen ? "▸ Anmelden / Registrieren" : "▾ Anmelden / Registrieren";
      });
    }

    const form = document.getElementById("authForm");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      const email = document.getElementById("authEmailInput")?.value || "";
      const password = document.getElementById("authPasswordInput")?.value || "";
      try {
        const linked = await signInWithEmailPassword(email, password);
        if (linked?.isPermanent) {
          deps.showToast("Angemeldet.", "success");
          await deps.onLinked?.(linked);
          trackEvent("ui_password_signed_in");
        }
      } catch (err) {
        trackError(err, { source: "auth_ui.sign_in" });
        deps.showToast(err?.message || "Anmeldung fehlgeschlagen.", "error", 5500);
      } finally {
        busy = false;
      }
    });

    document.getElementById("authRegisterBtn")?.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      const email = document.getElementById("authEmailInput")?.value || "";
      const password = document.getElementById("authPasswordInput")?.value || "";
      try {
        const linked = await registerWithEmailPassword(email, password);
        if (linked?.isPermanent) {
          deps.showToast("Konto erstellt — angemeldet.", "success");
          await deps.onLinked?.(linked);
          trackEvent("ui_password_registered");
        }
      } catch (err) {
        trackError(err, { source: "auth_ui.register" });
        deps.showToast(err?.message || "Registrierung fehlgeschlagen.", "error", 5500);
      } finally {
        busy = false;
      }
    });

    document.getElementById("authResetBtn")?.addEventListener("click", async () => {
      if (busy) return;
      const email = document.getElementById("authEmailInput")?.value || "";
      if (!email.trim()) {
        deps.showToast("Bitte zuerst E-Mail eintragen.", "info", 3500);
        return;
      }
      busy = true;
      try {
        await resetPassword(email);
        deps.showToast("Reset-Mail gesendet — Link öffnen und Passwort setzen.", "success", 5500);
        trackEvent("ui_password_reset");
      } catch (err) {
        trackError(err, { source: "auth_ui.reset" });
        deps.showToast(err?.message || "Reset fehlgeschlagen.", "error", 5500);
      } finally {
        busy = false;
      }
    });

    document.getElementById("authSignOutBtn")?.addEventListener("click", async () => {
      try {
        await signOutToGuest();
        deps.showToast("Als Gast weiter.", "success");
      } catch (err) {
        trackError(err, { source: "auth_ui.signout" });
        deps.showToast("Abmelden fehlgeschlagen.", "error");
      }
    });

    deps.onAuthUiChange?.(snap);
  }

  render(getAuthSnapshot());
  return onAuthChange(render);
}

/** Open guest login form on the home tab (used from Training). */
export function openAuthPanelForLogin() {
  const panel = document.getElementById("authCollapsible");
  const btn = document.getElementById("authToggleBtn");
  if (panel && btn && !panel.classList.contains("open")) {
    panel.classList.add("open");
    btn.textContent = "▾ Anmelden / Registrieren";
  }
  document.getElementById("authPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("authEmailInput")?.focus();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
