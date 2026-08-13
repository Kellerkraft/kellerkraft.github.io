/**
 * Auth module — anonymous guest + email/password.
 * Persistence: browser local (Password Manager friendly).
 */
import {
  onAuthStateChanged,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  linkWithCredential,
  EmailAuthProvider,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { trackEvent, trackError } from "./telemetry.js";

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
  if (code === "auth/missing-password" || code === "auth/weak-password") {
    return "Passwort zu kurz — mindestens 6 Zeichen.";
  }
  if (code === "auth/wrong-password" || code === "auth/invalid-credential" || code === "auth/invalid-login-credentials") {
    return "E-Mail oder Passwort stimmt nicht.";
  }
  if (code === "auth/user-not-found") {
    return "Kein Konto mit dieser E-Mail — bitte registrieren.";
  }
  if (code === "auth/email-already-in-use") {
    return "Diese E-Mail ist schon registriert — bitte anmelden oder Passwort zurücksetzen.";
  }
  if (code === "auth/too-many-requests") return "Zu viele Versuche — bitte kurz warten.";
  if (code === "auth/unauthorized-domain") {
    return "Diese Domain ist in Firebase unter Authorized domains noch nicht freigegeben.";
  }
  if (code === "auth/operation-not-allowed") {
    return "E-Mail/Passwort ist in Firebase noch nicht aktiviert (Authentication → Anmeldemethode → E-Mail/Passwort).";
  }
  return err?.message || "Anmeldung fehlgeschlagen.";
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function assertEmailPassword(email, password) {
  const cleaned = cleanEmail(email);
  if (!cleaned || !cleaned.includes("@")) {
    throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
  }
  if (!password || String(password).length < 6) {
    throw new Error("Passwort zu kurz — mindestens 6 Zeichen.");
  }
  return cleaned;
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

/**
 * Register with email/password. Links anonymous guest when possible so UID stays.
 */
export async function registerWithEmailPassword(email, password) {
  await ensurePersistence();
  const cleaned = assertEmailPassword(email, password);
  try {
    let userCred;
    if (auth.currentUser?.isAnonymous) {
      const credential = EmailAuthProvider.credential(cleaned, password);
      try {
        userCred = await linkWithCredential(auth.currentUser, credential);
        trackEvent("auth_password_linked");
      } catch (err) {
        if (err?.code === "auth/credential-already-in-use" || err?.code === "auth/email-already-in-use") {
          userCred = await signInWithEmailAndPassword(auth, cleaned, password);
          trackEvent("auth_password_signed_in_existing");
        } else {
          throw err;
        }
      }
    } else {
      userCred = await createUserWithEmailAndPassword(auth, cleaned, password);
      trackEvent("auth_password_registered");
    }
    currentUser = userCred.user;
    notify();
    return getAuthSnapshot();
  } catch (err) {
    trackError(err, { source: "auth.register" });
    const mapped = new Error(mapAuthError(err));
    mapped.code = err?.code;
    throw mapped;
  }
}

export async function signInWithEmailPassword(email, password) {
  await ensurePersistence();
  const cleaned = assertEmailPassword(email, password);
  try {
    const userCred = await signInWithEmailAndPassword(auth, cleaned, password);
    currentUser = userCred.user;
    trackEvent("auth_password_signed_in");
    notify();
    return getAuthSnapshot();
  } catch (err) {
    trackError(err, { source: "auth.sign_in" });
    const mapped = new Error(mapAuthError(err));
    mapped.code = err?.code;
    throw mapped;
  }
}

/** For accounts that only had magic-link before — sets a password via mail. */
export async function resetPassword(email) {
  await ensurePersistence();
  const cleaned = cleanEmail(email);
  if (!cleaned || !cleaned.includes("@")) {
    throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
  }
  try {
    await sendPasswordResetEmail(auth, cleaned);
    trackEvent("auth_password_reset_sent");
    return cleaned;
  } catch (err) {
    trackError(err, { source: "auth.reset" });
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
