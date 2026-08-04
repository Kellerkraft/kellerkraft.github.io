/**
 * Auth module — anonymous guest + email magic link.
 * Email is embedded in the continue URL so opening the mail link
 * does not require re-typing the address (no prompt).
 */
import {
  onAuthStateChanged,
  signInAnonymously,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  linkWithCredential,
  EmailAuthProvider,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { trackEvent, trackError } from "./telemetry.js";

const EMAIL_KEY = "kg_email_for_sign_in";

/** @type {import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").User|null} */
let currentUser = null;
const listeners = new Set();
let persistenceReady = null;

function notify() {
  const snapshot = getAuthSnapshot();
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch (err) { trackError(err, { source: "auth.listener" }); }
  });
}

async function ensurePersistence() {
  if (!persistenceReady) {
    persistenceReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
      trackError(err, { source: "auth.persistence" });
    });
  }
  await persistenceReady;
}

function mapAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/invalid-email") return "Ungültige E-Mail-Adresse.";
  if (code === "auth/missing-email") return "Bitte E-Mail eingeben.";
  if (code === "auth/email-required-for-link") {
    return "Bitte dieselbe E-Mail eingeben, an die der Link geschickt wurde.";
  }
  if (code === "auth/too-many-requests") return "Zu viele Versuche — bitte kurz warten.";
  if (code === "auth/unauthorized-domain") {
    return "Diese Domain ist in Firebase unter Authorized domains noch nicht freigegeben.";
  }
  if (code === "auth/operation-not-allowed") {
    return "E-Mail-Link ist in Firebase noch nicht aktiviert (Authentication → E-Mail/Passwort → E-Mail-Link).";
  }
  if (code === "auth/invalid-action-code" || code === "auth/expired-action-code") {
    return "Der Link ist ungültig oder abgelaufen — bitte neu anfordern.";
  }
  return err?.message || "Anmeldung fehlgeschlagen.";
}

function buildContinueUrl(email) {
  const url = new URL(location.href);
  // Stay on current path (GitHub Pages root or subpath)
  url.search = "";
  url.hash = "";
  url.searchParams.set("auth", "email");
  url.searchParams.set("email", email);
  return url.toString();
}

/**
 * Resolve email for link completion without prompting.
 * Priority: explicit override → URL ?email= → localStorage.
 */
export function resolveEmailForSignInLink(href = window.location.href, emailOverride = "") {
  const override = String(emailOverride || "").trim().toLowerCase();
  if (override.includes("@")) return override;

  try {
    const url = new URL(href);
    const fromQuery = (url.searchParams.get("email") || url.searchParams.get("e") || "").trim().toLowerCase();
    if (fromQuery.includes("@")) return fromQuery;

    // Firebase sometimes nests continueUrl
    const continueUrl = url.searchParams.get("continueUrl");
    if (continueUrl) {
      const nested = new URL(continueUrl);
      const nestedEmail = (nested.searchParams.get("email") || nested.searchParams.get("e") || "").trim().toLowerCase();
      if (nestedEmail.includes("@")) return nestedEmail;
    }
  } catch { /* ignore */ }

  const stored = (localStorage.getItem(EMAIL_KEY) || "").trim().toLowerCase();
  return stored.includes("@") ? stored : "";
}

export function isEmailSignInLink(href = window.location.href) {
  try {
    return isSignInWithEmailLink(auth, href);
  } catch {
    return false;
  }
}

function cleanAuthParamsFromUrl(href = window.location.href) {
  try {
    const url = new URL(href);
    ["auth", "email", "e", "apiKey", "oobCode", "mode", "lang", "continueUrl"].forEach((key) => {
      url.searchParams.delete(key);
    });
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  } catch { /* ignore */ }
}

export function getAuthSnapshot() {
  const user = currentUser || auth.currentUser;
  return {
    user,
    uid: user?.uid || null,
    isAnonymous: Boolean(user?.isAnonymous),
    email: user?.email || null,
    displayName: user?.displayName || null,
    isSignedIn: Boolean(user),
    isPermanent: Boolean(user && !user.isAnonymous)
  };
}

export function onAuthChange(fn) {
  listeners.add(fn);
  fn(getAuthSnapshot());
  return () => listeners.delete(fn);
}

export async function ensureAuth() {
  await ensurePersistence();
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      if (!user) {
        try {
          const cred = await signInAnonymously(auth);
          currentUser = cred.user;
          trackEvent("auth_anonymous");
        } catch (err) {
          trackError(err, { source: "auth.anonymous" });
          unsub();
          reject(err);
          return;
        }
      }
      notify();
      unsub();
      resolve(getAuthSnapshot());
    }, reject);
  });
}

export function watchAuth() {
  return onAuthStateChanged(auth, (user) => {
    currentUser = user;
    notify();
  });
}

export async function sendEmailSignInLink(email) {
  await ensurePersistence();
  const cleaned = String(email || "").trim().toLowerCase();
  if (!cleaned || !cleaned.includes("@")) {
    throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
  }
  try {
    const actionCodeSettings = {
      url: buildContinueUrl(cleaned),
      handleCodeInApp: true
    };
    await sendSignInLinkToEmail(auth, cleaned, actionCodeSettings);
    localStorage.setItem(EMAIL_KEY, cleaned);
    trackEvent("auth_email_link_sent");
    return cleaned;
  } catch (err) {
    trackError(err, { source: "auth.email_link_send" });
    const mapped = new Error(mapAuthError(err));
    mapped.code = err?.code;
    throw mapped;
  }
}

/**
 * Complete magic-link sign-in. Never uses window.prompt.
 * @param {string} [href]
 * @param {string} [emailOverride] only if URL/localStorage have no email
 * @returns {Promise<object|null>} auth snapshot, or null if URL is not a sign-in link
 */
export async function completeEmailLinkSignIn(href = window.location.href, emailOverride = "") {
  await ensurePersistence();
  if (!isSignInWithEmailLink(auth, href)) return null;

  const email = resolveEmailForSignInLink(href, emailOverride);
  if (!email) {
    const err = new Error("Bitte dieselbe E-Mail eingeben, an die der Link geschickt wurde.");
    err.code = "auth/email-required-for-link";
    throw err;
  }

  try {
    const credential = EmailAuthProvider.credentialWithLink(email, href);
    let userCred;
    try {
      if (auth.currentUser?.isAnonymous) {
        userCred = await linkWithCredential(auth.currentUser, credential);
        trackEvent("auth_email_linked");
      } else {
        userCred = await signInWithEmailLink(auth, email, href);
        trackEvent("auth_email_signed_in");
      }
    } catch (err) {
      if (err?.code === "auth/credential-already-in-use" || err?.code === "auth/email-already-in-use") {
        userCred = await signInWithEmailLink(auth, email, href);
        trackEvent("auth_email_signed_in_existing");
      } else {
        throw err;
      }
    }

    localStorage.removeItem(EMAIL_KEY);
    currentUser = userCred.user;
    cleanAuthParamsFromUrl(href);
    notify();
    return getAuthSnapshot();
  } catch (err) {
    if (err?.code === "auth/email-required-for-link") throw err;
    trackError(err, { source: "auth.email_link" });
    const mapped = new Error(mapAuthError(err));
    mapped.code = err?.code;
    throw mapped;
  }
}

export async function signOutToGuest() {
  await ensurePersistence();
  await signOut(auth);
  const cred = await signInAnonymously(auth);
  currentUser = cred.user;
  trackEvent("auth_signed_out_to_guest");
  notify();
  return getAuthSnapshot();
}

export function requireUid() {
  const uid = auth.currentUser?.uid || currentUser?.uid;
  if (!uid) throw new Error("Nicht angemeldet.");
  return uid;
}
