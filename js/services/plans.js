/**
 * Plans service — v2 paths with MVP migration.
 */
import { ref, get, set, push } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "../firebase.js";
import { Paths, buildPlan, safeUserKey } from "../data-model.js";
import { requireUid } from "../auth.js";
import { trackEvent, trackError } from "../telemetry.js";

const DEFAULT_PLAN_ID = "weekly";
const localKey = (uid) => `kg_plan_uid_${uid}`;

function readLocal(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey(uid)) || "null");
    return raw;
  } catch {
    return null;
  }
}

function writeLocal(uid, plan) {
  localStorage.setItem(localKey(uid), JSON.stringify(plan));
}

function blocksFromMvpItems(items) {
  return (items || []).map((item) => ({
    day: Number(item.day) || 0,
    focus: item.focus || "",
    note: item.note || "",
    exerciseIds: []
  }));
}

async function loadLegacyMvpPlan(displayName) {
  if (!displayName) return null;
  try {
    const snap = await get(ref(db, Paths.legacy.mvpPlan(safeUserKey(displayName))));
    const val = snap.val();
    if (!val) return null;
    const items = Array.isArray(val.meta?.items) ? val.meta.items : [];
    return buildPlan({
      name: "Wochenplan",
      blocks: blocksFromMvpItems(items),
      days: items.map((i) => Number(i.day)).filter((d) => Number.isInteger(d)),
      exerciseIds: ["mvp-plan"],
      createdAt: val.createdAt,
      updatedAt: val.updatedAt
    });
  } catch (err) {
    trackError(err, { source: "plans.legacy_mvp" });
    return null;
  }
}

export async function loadWeeklyPlan(uid = requireUid(), hintName = "") {
  const local = readLocal(uid);
  try {
    const snap = await get(ref(db, Paths.plan(uid, DEFAULT_PLAN_ID)));
    if (snap.exists()) {
      const plan = buildPlan(snap.val());
      writeLocal(uid, plan);
      return { id: DEFAULT_PLAN_ID, ...plan };
    }
  } catch (err) {
    trackError(err, { source: "plans.load" });
    if (local) return { id: DEFAULT_PLAN_ID, ...buildPlan(local) };
  }

  const legacy = await loadLegacyMvpPlan(hintName);
  if (legacy) {
    try {
      await saveWeeklyPlan(legacy, uid);
      trackEvent("plan_migrated_from_mvp");
    } catch {
      writeLocal(uid, legacy);
    }
    return { id: DEFAULT_PLAN_ID, ...legacy };
  }

  if (local) return { id: DEFAULT_PLAN_ID, ...buildPlan(local) };
  return {
    id: DEFAULT_PLAN_ID,
    ...buildPlan({
      name: "Wochenplan",
      exerciseIds: ["placeholder"],
      blocks: [{ day: 1, focus: "Ganzkörper", note: "", exerciseIds: [] }]
    })
  };
}

/**
 * @param {object} partial plan fields or { blocks: mvp-style rows }
 */
export async function saveWeeklyPlan(partial, uid = requireUid()) {
  let blocks = Array.isArray(partial.blocks) ? partial.blocks : null;
  // Accept MVP row shape: [{day, focus, note}]
  if (!blocks && Array.isArray(partial.items)) {
    blocks = blocksFromMvpItems(partial.items);
  }
  const plan = buildPlan({
    ...partial,
    blocks: blocks || [],
    days: (blocks || []).map((b) => Number(b.day)).filter((d) => Number.isInteger(d)),
    // Rules require non-empty exerciseIds
    exerciseIds: (partial.exerciseIds && partial.exerciseIds.length)
      ? partial.exerciseIds
      : ["plan-weekly"]
  });
  writeLocal(uid, plan);
  await set(ref(db, Paths.plan(uid, DEFAULT_PLAN_ID)), plan);
  trackEvent("plan_saved", { days: plan.blocks.length });
  return { id: DEFAULT_PLAN_ID, ...plan };
}

export async function createNamedPlan(partial, uid = requireUid()) {
  const plan = buildPlan(partial);
  const newRef = push(ref(db, Paths.plans(uid)));
  await set(newRef, plan);
  trackEvent("plan_created");
  return { id: newRef.key, ...plan };
}
