/**
 * Auth account panel UI — email magic link (+ guest).
 */
import {
  getAuthSnapshot,
  onAuthChange,
  sendEmailSignInLink,
  signOutToGuest,
  isEmailSignInLink,
  resolveEmailForSignInLink,
  completeEmailLinkSignIn
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

  let completingLink = false;

  function render(snap) {
    const permanent = snap.isPermanent;
    const trainingName = (deps.getTrainingUser?.() || "").trim();
    const label = permanent
      ? (snap.email || "Konto")
      : "Gast (anonym)";

    const pendingLink = !permanent && isEmailSignInLink();
    const prefillEmail = pendingLink ? resolveEmailForSignInLink() : "";

    mount.innerHTML = `
      <div class="auth-card">
        <div class="auth-status">
          <span class="auth-label">${permanent ? "Angemeldet" : "Gastmodus"}</span>
          <span class="auth-value">${escapeHtml(label)}</span>
          ${trainingName ? `<span class="auth-training-name">Trainingsprofil: <strong>${escapeHtml(trainingName)}</strong></span>` : ""}
        </div>
        ${permanent ? `
          <div class="sub auth-hint">Dein Konto ist mit dem Trainingsprofil verknüpft — gleicher Name für Logs, Streaks und Auszeichnung.</div>
          <button type="button" class="btn-main btn-dark" id="authSignOutBtn">Abmelden (weiter als Gast)</button>
        ` : pendingLink ? `
          <div class="field-label">Anmelde-Link erkannt</div>
          <div class="sub auth-hint">Falls nötig, dieselbe E-Mail bestätigen — bei neuen Links ist sie schon im Link enthalten.</div>
          <input id="authEmailConfirmInput" class="name-input" type="email" placeholder="name@example.com" value="${escapeAttr(prefillEmail)}" autocomplete="email">
          <button type="button" class="btn-main btn-lime" id="authCompleteLinkBtn">Anmeldung abschließen</button>
        ` : `
          <div class="field-label">Konto sichern (E-Mail-Link)</div>
          <input id="authEmailInput" class="name-input" type="email" placeholder="name@example.com" autocomplete="email">
          <button type="button" class="btn-main btn-lime" id="authEmailBtn">Link senden</button>
          <div class="sub auth-hint">Link in der Mail öffnen (dieser Browser). Danach bist du angemeldet — ohne Passwort, ohne Extra-Eingabe.</div>
        `}
      </div>
    `;

    document.getElementById("authEmailBtn")?.addEventListener("click", async () => {
      const email = document.getElementById("authEmailInput")?.value || "";
      try {
        await sendEmailSignInLink(email);
        deps.showToast("Link gesendet — in der Mail den Link antippen (dieser Browser).", "success", 5500);
        trackEvent("ui_email_link_sent");
      } catch (err) {
        trackError(err, { source: "auth_ui.email" });
        deps.showToast(err?.message || "E-Mail-Link fehlgeschlagen.", "error", 5500);
      }
    });

    document.getElementById("authCompleteLinkBtn")?.addEventListener("click", async () => {
      if (completingLink) return;
      completingLink = true;
      const email = document.getElementById("authEmailConfirmInput")?.value || "";
      try {
        const linked = await completeEmailLinkSignIn(window.location.href, email);
        if (linked?.isPermanent) {
          deps.showToast("Angemeldet.", "success");
          await deps.onLinked?.(linked);
        }
      } catch (err) {
        trackError(err, { source: "auth_ui.complete_link" });
        deps.showToast(err?.message || "Link-Anmeldung fehlgeschlagen.", "error", 5500);
      } finally {
        completingLink = false;
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

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}
