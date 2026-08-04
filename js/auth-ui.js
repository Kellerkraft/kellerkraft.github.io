/**
 * Auth account panel UI (email magic link + Google + guest).
 */
import {
  getAuthSnapshot,
  onAuthChange,
  sendEmailSignInLink,
  signInWithGoogle,
  signOutToGuest
} from "./auth.js";
import { trackEvent, trackError } from "./telemetry.js";

/**
 * @param {object} deps
 * @param {(msg: string, type?: string, duration?: number) => void} deps.showToast
 * @param {(snap: object) => void} [deps.onAuthUiChange]
 */
export function initAuthPanel(deps) {
  const mount = document.getElementById("authPanel");
  if (!mount) return () => {};

  function render(snap) {
    const permanent = snap.isPermanent;
    const label = permanent
      ? (snap.email || snap.displayName || "Konto")
      : "Gast (anonym)";

    mount.innerHTML = `
      <div class="auth-card">
        <div class="auth-status">
          <span class="auth-label">${permanent ? "Angemeldet" : "Gastmodus"}</span>
          <span class="auth-value">${escapeHtml(label)}</span>
        </div>
        ${permanent ? `
          <button type="button" class="btn-main btn-dark" id="authSignOutBtn">Abmelden (weiter als Gast)</button>
        ` : `
          <div class="field-label">Konto sichern (E-Mail-Link)</div>
          <input id="authEmailInput" class="name-input" type="email" placeholder="name@example.com" autocomplete="email">
          <button type="button" class="btn-main btn-lime" id="authEmailBtn">Link senden</button>
          <button type="button" class="btn-main btn-dark" id="authGoogleBtn">Mit Google anmelden</button>
          <div class="sub auth-hint">Mit Konto bleiben Profil &amp; Pläne an deine UID gebunden — auch auf anderen Geräten.</div>
        `}
      </div>
    `;

    document.getElementById("authEmailBtn")?.addEventListener("click", async () => {
      const email = document.getElementById("authEmailInput")?.value || "";
      try {
        await sendEmailSignInLink(email);
        deps.showToast("Link gesendet — prüfe dein Postfach und öffne den Link auf diesem Gerät.", "success", 5000);
      } catch (err) {
        trackError(err, { source: "auth_ui.email" });
        deps.showToast(err?.message || "E-Mail-Link fehlgeschlagen. In Firebase Auth muss E-Mail-Link aktiviert sein.", "error", 5500);
      }
    });

    document.getElementById("authGoogleBtn")?.addEventListener("click", async () => {
      try {
        await signInWithGoogle();
        deps.showToast("Mit Google angemeldet.", "success");
        trackEvent("ui_google_sign_in");
      } catch (err) {
        trackError(err, { source: "auth_ui.google" });
        const msg = err?.code === "auth/operation-not-allowed"
          ? "Google-Anmeldung ist in Firebase noch nicht aktiviert."
          : (err?.message || "Google-Anmeldung fehlgeschlagen.");
        deps.showToast(msg, "error", 5500);
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
