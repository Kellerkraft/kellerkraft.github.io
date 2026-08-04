/**
 * Auth module — anonymous guest + email magic link + optional Google.
 * Links anonymous sessions to permanent accounts when possible.
 */
import {
  onAuthStateChanged,
  signInAnonymously,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  linkWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { trackEvent, trackError } from "./telemetry.js";

const EMAIL_KEY = "kg_email_for_sign_in";
const ACTION_CODE_SETTINGS = {
  url: `${location.origin}${location.pathname}?auth=email`,
  handleCodeInApp: true
};

/** @type {import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js").User|null} */
let currentUser = null;
const listeners = new Set();

function notify() {
  const snapshot = getAuthSnapshot();
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch (err) { trackError(err, { source: "auth.listener" }); }
  });
}

export function getAuthSnapshot() {
  const user = currentUser;
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
  const cleaned = String(email || "").trim().toLowerCase();
  if (!cleaned || !cleaned.includes("@")) {
    throw new Error("Bitte eine gültige E-Mail-Adresse eingeben.");
  }
  await sendSignInLinkToEmail(auth, cleaned, ACTION_CODE_SETTINGS);
  localStorage.setItem(EMAIL_KEY, cleaned);
  trackEvent("auth_email_link_sent");
  return cleaned;
}

export async function completeEmailLinkSignIn(href = window.location.href) {
  if (!isSignInWithEmailLink(auth, href)) return null;

  let email = localStorage.getItem(EMAIL_KEY) || "";
  if (!email) {
    email = window.prompt("Bitte die E-Mail bestätigen, mit der der Link angefordert wurde:") || "";
  }
  email = email.trim().toLowerCase();
  if (!email) throw new Error("E-Mail fehlt für den Anmelde-Link.");

  const credential = EmailAuthProvider.credentialWithLink(email, href);
  let userCred;
  try {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      userCred = await linkWithCredential(auth.currentUser, credential);
      trackEvent("auth_email_linked");
    } else {
      userCred = await signInWithEmailLink(auth, email, href);
      trackEvent("auth_email_signed_in");
    }
  } catch (err) {
    // Already linked elsewhere → fall back to direct sign-in
    if (err?.code === "auth/credential-already-in-use" || err?.code === "auth/email-already-in-use") {
      userCred = await signInWithEmailLink(auth, email, href);
      trackEvent("auth_email_signed_in_existing");
    } else {
      trackError(err, { source: "auth.email_link" });
      throw err;
    }
  }

  localStorage.removeItem(EMAIL_KEY);
  currentUser = userCred.user;

  // Clean auth query from URL
  try {
    const url = new URL(href);
    url.searchParams.delete("auth");
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  } catch { /* ignore */ }

  notify();
  return getAuthSnapshot();
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    let userCred;
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      try {
        userCred = await linkWithPopup(auth.currentUser, provider);
        trackEvent("auth_google_linked");
      } catch (err) {
        if (err?.code === "auth/credential-already-in-use" || err?.code === "auth/email-already-in-use") {
          userCred = await signInWithPopup(auth, provider);
          trackEvent("auth_google_signed_in_existing");
        } else {
          throw err;
        }
      }
    } else {
      userCred = await signInWithPopup(auth, provider);
      trackEvent("auth_google_signed_in");
    }
    currentUser = userCred.user;
    notify();
    return getAuthSnapshot();
  } catch (err) {
    trackError(err, { source: "auth.google" });
    throw err;
  }
}

export async function signOutToGuest() {
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
