/**
 * User profile service — v2 paths with MVP/legacy migration.
 */
import { ref, get, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "../firebase.js";
import {
  Paths,
  buildUserProfile,
  safeUserKey
} from "../data-model.js";
import { requireUid } from "../auth.js";
import { trackEvent, trackError } from "../telemetry.js";

const localKey = (uid) => `kg_profile_uid_${uid}`;

function readLocal(uid) {
  try {
    return JSON.parse(localStorage.getItem(localKey(uid)) || "null");
  } catch {
    return null;
  }
}

function writeLocal(uid, profile) {
  localStorage.setItem(localKey(uid), JSON.stringify(profile));
}

async function loadLegacyMvpProfile(displayName) {
  if (!displayName) return null;
  try {
    const snap = await get(ref(db, Paths.legacy.mvpProfile(safeUserKey(displayName))));
    const val = snap.val();
    if (!val) return null;
    const meta = val.meta || {};
    return buildUserProfile({
      displayName: meta.name || displayName,
      avatar: meta.avatar || "💪",
      goal: meta.goal || "",
      favoriteBodies: meta.favoriteBodies || [],
      weekGoal: meta.weekGoal ?? null,
      createdAt: val.createdAt,
      updatedAt: val.updatedAt
    });
  } catch (err) {
    trackError(err, { source: "users.legacy_mvp" });
    return null;
  }
}

export async function loadUserProfile(uid = requireUid(), hintName = "") {
  const local = readLocal(uid);
  try {
    const snap = await get(ref(db, Paths.user(uid)));
    if (snap.exists()) {
      const profile = buildUserProfile(snap.val());
      writeLocal(uid, profile);
      return profile;
    }
  } catch (err) {
    trackError(err, { source: "users.load" });
    if (local) return buildUserProfile(local);
  }

  const legacy = await loadLegacyMvpProfile(hintName || local?.displayName || "");
  if (legacy) {
    // Best-effort migrate into v2 path
    try {
      await saveUserProfile(legacy, uid);
      trackEvent("profile_migrated_from_mvp");
    } catch {
      writeLocal(uid, legacy);
    }
    return legacy;
  }

  return buildUserProfile({
    displayName: hintName || local?.displayName || "",
    avatar: local?.avatar || "💪",
    goal: local?.goal || "",
    favoriteBodies: local?.favoriteBodies || []
  });
}

export async function saveUserProfile(partial, uid = requireUid()) {
  const existing = readLocal(uid) || {};
  const profile = buildUserProfile({
    ...existing,
    ...partial,
    createdAt: existing.createdAt || partial.createdAt || Date.now()
  });
  if (!profile.displayName) {
    throw new Error("Anzeigename fehlt.");
  }
  writeLocal(uid, profile);
  await set(ref(db, Paths.user(uid)), profile);
  trackEvent("profile_saved");
  return profile;
}
