/**
 * Logs helper — streak derivation with uid + legacy name dual-read.
 */
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "../firebase.js";
import { Paths, deriveStreakFromLogs, trainingDaysThisWeek, safeUserKey } from "../data-model.js";
import { requireUid } from "../auth.js";
import { trackError } from "../telemetry.js";

async function loadLogsTree(path) {
  try {
    const snap = await get(ref(db, path));
    return snap.val() || {};
  } catch (err) {
    trackError(err, { source: "logs.load", path });
    return {};
  }
}

/**
 * Merge two log trees by exercise id (shallow merge of entry maps).
 */
function mergeLogTrees(a, b) {
  const out = { ...(a || {}) };
  Object.entries(b || {}).forEach(([exId, entries]) => {
    out[exId] = { ...(out[exId] || {}), ...(entries || {}) };
  });
  return out;
}

export async function loadUserLogsTree(uid = requireUid(), legacyDisplayName = "") {
  const uidTree = await loadLogsTree(Paths.logs(uid));
  if (!legacyDisplayName) return uidTree;
  const legacyTree = await loadLogsTree(Paths.legacy.logsByName(safeUserKey(legacyDisplayName)));
  // Avoid double-counting if legacy key accidentally equals uid
  if (safeUserKey(legacyDisplayName) === uid) return uidTree;
  return mergeLogTrees(uidTree, legacyTree);
}

export async function getUserStreak(uid = requireUid(), legacyDisplayName = "") {
  const tree = await loadUserLogsTree(uid, legacyDisplayName);
  return deriveStreakFromLogs(tree);
}

export async function getWeekTrainingDays(uid = requireUid(), legacyDisplayName = "") {
  const tree = await loadUserLogsTree(uid, legacyDisplayName);
  return trainingDaysThisWeek(tree);
}
