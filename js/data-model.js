/**
 * Kellerkraft — Firebase Realtime Database schema v2
 * Source of truth for paths, roles, and entity shapes.
 * See docs/data-model-v2.md for the full sketch and migration notes.
 */

export const SCHEMA_VERSION = 2;

export const ROLES = Object.freeze({
  OWNER: "owner",
  COACH: "coach",
  MEMBER: "member"
});

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.MEMBER]: Object.freeze({
    readOwnProfile: true,
    writeOwnProfile: true,
    readOthersProfile: true,
    writeOthersProfile: false,
    crudOwnPlans: true,
    readOthersPlans: false,
    writeOthersPlans: false,
    crudOwnLogsWorkouts: true,
    readOthersLogs: false,
    deleteOthersLogs: false,
    createReservation: true,
    deleteOwnReservation: true,
    deleteAnyReservation: false,
    setStatus: true,
    writeExercises: false,
    deleteExercises: false,
    writeOwnEvents: true,
    deleteEvents: false,
    assignRoles: false,
    deleteUserData: false
  }),
  [ROLES.COACH]: Object.freeze({
    readOwnProfile: true,
    writeOwnProfile: true,
    readOthersProfile: true,
    writeOthersProfile: true,
    crudOwnPlans: true,
    readOthersPlans: true,
    writeOthersPlans: true,
    crudOwnLogsWorkouts: true,
    readOthersLogs: true,
    deleteOthersLogs: false,
    createReservation: true,
    deleteOwnReservation: true,
    deleteAnyReservation: false,
    setStatus: true,
    writeExercises: true,
    deleteExercises: false,
    writeOwnEvents: true,
    deleteEvents: false,
    assignRoles: false,
    deleteUserData: false
  }),
  [ROLES.OWNER]: Object.freeze({
    readOwnProfile: true,
    writeOwnProfile: true,
    readOthersProfile: true,
    writeOthersProfile: true,
    crudOwnPlans: true,
    readOthersPlans: true,
    writeOthersPlans: true,
    crudOwnLogsWorkouts: true,
    readOthersLogs: true,
    deleteOthersLogs: true,
    createReservation: true,
    deleteOwnReservation: true,
    deleteAnyReservation: true,
    setStatus: true,
    writeExercises: true,
    deleteExercises: true,
    writeOwnEvents: true,
    deleteEvents: true,
    assignRoles: true,
    deleteUserData: true
  })
});

/** Valid favoriteBodies / body-area tokens used in profiles and exercises. */
export const BODY_AREAS = Object.freeze([
  "arme",
  "bauch",
  "beine",
  "brust",
  "ruecken"
]);

export const EVENT_TYPES = Object.freeze([
  "workout",
  "pr",
  "streak",
  "plan"
]);

/**
 * RTDB path builders under gym/.
 * v2 keys use auth.uid (works with anonymous auth). Display names live in profile fields.
 * Legacy name-keyed paths are under Paths.legacy during migration.
 */
export const Paths = Object.freeze({
  root: () => "gym",
  meta: () => "gym/meta",
  schemaVersion: () => "gym/meta/schemaVersion",
  role: (uid) => `gym/roles/${uid}`,
  user: (uid) => `gym/users/${uid}`,
  plans: (uid) => `gym/plans/${uid}`,
  plan: (uid, planId) => `gym/plans/${uid}/${planId}`,
  workoutTemplates: (uid) => `gym/workouts/${uid}/templates`,
  workoutTemplate: (uid, workoutId) => `gym/workouts/${uid}/templates/${workoutId}`,
  lastWorkout: (uid) => `gym/workouts/${uid}/last`,
  logs: (uid) => `gym/logs/${uid}`,
  exerciseLogs: (uid, exerciseId) => `gym/logs/${uid}/${exerciseId}`,
  log: (uid, exerciseId, logId) => `gym/logs/${uid}/${exerciseId}/${logId}`,
  reservations: () => "gym/reservations",
  reservation: (id) => `gym/reservations/${id}`,
  status: () => "gym/status",
  exercises: () => "gym/exercises",
  exercise: (exerciseId) => `gym/exercises/${exerciseId}`,
  events: () => "gym/events",
  event: (eventId) => `gym/events/${eventId}`,

  // Legacy v1 paths (read during migration; do not write new MVP data here)
  legacy: Object.freeze({
    schedule: () => "gym/schedule",
    scheduleItem: (id) => `gym/schedule/${id}`,
    logsByName: (userName) => `gym/logs/${userName}`,
    lastWorkoutByName: (userName) => `gym/lastWorkout/${userName}`,
    customWorkouts: (safeName) => `gym/customWorkouts/${safeName}`,
    mvpProfile: (safeName) => `gym/customWorkouts/${safeName}/__mvp_profile`,
    mvpPlan: (safeName) => `gym/customWorkouts/${safeName}/__mvp_plan`,
    mvpFeed: () => "gym/customWorkouts/mvp_shared_feed/items",
    exerciseOverrides: () => "gym/exerciseOverrides",
    exerciseOverride: (exerciseId) => `gym/exerciseOverrides/${exerciseId}`
  })
});

/** Sanitize display names for use as transitional RTDB keys. */
export function safeUserKey(user) {
  return String(user || "").trim().replace(/[.#$/\[\]]/g, "_");
}

/**
 * Build a v2 user profile object.
 * @param {object} partial
 * @returns {{ displayName: string, avatar: string, goal: string, favoriteBodies: string[], weekGoal: number|null, createdAt: number, updatedAt: number }}
 */
export function buildUserProfile(partial = {}) {
  const now = Date.now();
  const favoriteBodies = Array.isArray(partial.favoriteBodies)
    ? partial.favoriteBodies.filter((b) => BODY_AREAS.includes(b)).slice(0, 8)
    : [];
  const weekGoal = Number.isFinite(partial.weekGoal)
    ? Math.min(7, Math.max(1, Math.round(partial.weekGoal)))
    : null;
  return {
    displayName: String(partial.displayName || partial.name || "").trim().slice(0, 40),
    avatar: String(partial.avatar || "").slice(0, 80),
    goal: String(partial.goal || "").slice(0, 200),
    favoriteBodies,
    weekGoal,
    createdAt: partial.createdAt || now,
    updatedAt: now
  };
}

/**
 * Build a v2 plan object (weekly note plan).
 * Mesocycles use js/mesocycle.js (local-first) in v1 of hypertrophy periodization.
 * @param {object} partial
 */
export function buildPlan(partial = {}) {
  const now = Date.now();
  const exerciseIds = Array.isArray(partial.exerciseIds)
    ? partial.exerciseIds.map(String).slice(0, 40)
    : [];
  const days = Array.isArray(partial.days)
    ? partial.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).slice(0, 7)
    : [];
  const blocks = Array.isArray(partial.blocks)
    ? partial.blocks.slice(0, 7).map((b) => ({
        day: Number(b.day) || 0,
        focus: String(b.focus || "").slice(0, 40),
        note: String(b.note || "").slice(0, 200),
        exerciseIds: Array.isArray(b.exerciseIds) ? b.exerciseIds.map(String).slice(0, 40) : []
      }))
    : [];
  return {
    name: String(partial.name || "Wochenplan").trim().slice(0, 60),
    exerciseIds,
    days,
    blocks,
    createdAt: partial.createdAt || now,
    updatedAt: now
  };
}

/**
 * Build a feed/event entry.
 */
export function buildEvent(partial = {}) {
  const type = EVENT_TYPES.includes(partial.type) ? partial.type : "workout";
  return {
    type,
    text: String(partial.text || "").slice(0, 280),
    uid: partial.uid ? String(partial.uid) : null,
    user: String(partial.user || "").slice(0, 40),
    ts: partial.ts || Date.now()
  };
}

/**
 * Derive consecutive training-day streak from a logs tree:
 * { [exerciseId]: { [logId]: { date } } } or flat entry arrays.
 * @param {object} logsTree
 * @returns {number}
 */
export function deriveStreakFromLogs(logsTree) {
  const daySet = new Set();
  Object.values(logsTree || {}).forEach((entries) => {
    const list = Array.isArray(entries) ? entries : Object.values(entries || {});
    list.forEach((entry) => {
      if (!entry?.date) return;
      const d = new Date(entry.date);
      d.setHours(0, 0, 0, 0);
      daySet.add(d.getTime());
    });
  });
  if (!daySet.size) return 0;

  const days = [...daySet].sort((a, b) => b - a);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const yesterdayMs = todayMs - 86400000;
  if (days[0] !== todayMs && days[0] !== yesterdayMs) return 0;

  let streak = 1;
  let cursor = days[0];
  for (let i = 1; i < days.length; i++) {
    if (days[i] === cursor - 86400000) {
      streak++;
      cursor = days[i];
    } else if (days[i] < cursor - 86400000) {
      break;
    }
  }
  return streak;
}

/**
 * Count unique training days in the current local week (Mon–Sun).
 * @param {object} logsTree
 * @returns {number}
 */
export function trainingDaysThisWeek(logsTree) {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - day);
  const startMs = weekStart.getTime();
  const endMs = startMs + 7 * 86400000;

  const daySet = new Set();
  Object.values(logsTree || {}).forEach((entries) => {
    const list = Array.isArray(entries) ? entries : Object.values(entries || {});
    list.forEach((entry) => {
      if (!entry?.date) return;
      const t = entry.date;
      if (t >= startMs && t < endMs) {
        const d = new Date(t);
        d.setHours(0, 0, 0, 0);
        daySet.add(d.getTime());
      }
    });
  });
  return daySet.size;
}

const MS_DAY = 86400000;
const RECOVERY_MS = 48 * 3600000; // ~48h

/**
 * Last log timestamp per body area.
 * @param {object} logsTree
 * @param {Record<string, {body?: string}>} exerciseById
 * @returns {Record<string, number>}
 */
export function lastTrainedByBody(logsTree, exerciseById = {}) {
  const out = {};
  Object.entries(logsTree || {}).forEach(([exId, entries]) => {
    const body = exerciseById[exId]?.body;
    if (!body) return;
    const list = Array.isArray(entries) ? entries : Object.values(entries || {});
    list.forEach((entry) => {
      const t = Number(entry?.date) || 0;
      if (!t) return;
      if (!out[body] || t > out[body]) out[body] = t;
    });
  });
  return out;
}

/**
 * Suggest next upper/lower session from remaining week days + ~48h recovery.
 * @param {{ weekDays: number, weekGoal: number, lastByBody: Record<string, number>, now?: number }} opts
 * @returns {{ text: string, split: "upper"|"lower"|"either"|null } | null}
 */
export function suggestNextSessionSplit(opts = {}) {
  const weekDays = Number(opts.weekDays) || 0;
  const weekGoal = Math.max(1, Number(opts.weekGoal) || 3);
  const lastByBody = opts.lastByBody || {};
  const now = opts.now != null ? opts.now : Date.now();

  const remainingGoal = Math.max(0, weekGoal - weekDays);
  const today = new Date(now);
  const dayIdx = (today.getDay() + 6) % 7; // Mon=0
  const daysLeftInclToday = 7 - dayIdx;

  const lastUpper = Math.max(
    0,
    ...["brust", "ruecken", "arme"].map((b) => lastByBody[b] || 0)
  );
  const lastLower = lastByBody.beine || 0;
  const upperReady = !lastUpper || now - lastUpper >= RECOVERY_MS;
  const lowerReady = !lastLower || now - lastLower >= RECOVERY_MS;
  const hoursUntil = (ts) => Math.max(0, Math.ceil((RECOVERY_MS - (now - ts)) / 3600000));

  if (remainingGoal <= 0) {
    return {
      split: null,
      text: `Wochenziel erreicht (${weekDays}/${weekGoal}). Rest-Day ok — oder lockere Technik/Bauch.`
    };
  }

  const fmtWhen = (hours) => {
    if (hours <= 0) return "heute";
    if (hours <= 12) return `in ~${hours} Std.`;
    const days = Math.ceil(hours / 24);
    if (days === 1) return "morgen";
    return `in ${days} Tagen`;
  };

  if (upperReady && lowerReady) {
    const preferLower = lastLower && lastUpper && lastLower < lastUpper;
    const split = preferLower ? "lower" : "upper";
    const label = split === "lower" ? "Unterkörper" : "Oberkörper";
    return {
      split,
      text: `Noch ${remainingGoal} von ${weekGoal} Einheiten · ideal heute: ${label} (beide Splits erholt, ${daysLeftInclToday} Tage bis So).`
    };
  }

  if (upperReady && !lowerReady) {
    return {
      split: "upper",
      text: `Noch ${remainingGoal}/${weekGoal} · heute Oberkörper. Unterkörper wieder ${fmtWhen(hoursUntil(lastLower))} (~48h Regenerationszeit).`
    };
  }

  if (lowerReady && !upperReady) {
    return {
      split: "lower",
      text: `Noch ${remainingGoal}/${weekGoal} · heute Unterkörper. Oberkörper wieder ${fmtWhen(hoursUntil(lastUpper))} (~48h Regenerationszeit).`
    };
  }

  const nextUpperH = hoursUntil(lastUpper);
  const nextLowerH = hoursUntil(lastLower);
  const nextIsLower = nextLowerH <= nextUpperH;
  return {
    split: nextIsLower ? "lower" : "upper",
    text: `Beide Splits noch in Regeneration. Nächste Einheit: ${nextIsLower ? "Unterkörper" : "Oberkörper"} ${fmtWhen(Math.min(nextUpperH, nextLowerH))} · noch ${remainingGoal}/${weekGoal} diese Woche.`
  };
}

/**
 * Resolve effective role string; missing entry → member.
 */
export function effectiveRole(roleValue) {
  if (roleValue === ROLES.OWNER || roleValue === ROLES.COACH) return roleValue;
  return ROLES.MEMBER;
}

/**
 * Check a named permission for a role.
 */
export function can(roleValue, permission) {
  const role = effectiveRole(roleValue);
  return Boolean(ROLE_PERMISSIONS[role]?.[permission]);
}
