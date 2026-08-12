/**
 * Pragmatic hypertrophy mesocycle (RP-inspired, not Landmark).
 * Offline-first: localStorage per uid.
 *
 * Phase 1: schema, opt-in, start/continue, session
 * Phase 2: weekly volume, deload advice, RIR/set steering, next-cycle bump
 *
 * 5 weeks: Aufbau (1–2) → Peak (3–4) → Deload (5)
 */

import { BODY_AREAS } from "./data-model.js";

export const MESO_DURATION_WEEKS = 5;
export const MESO_FREQUENCIES = Object.freeze([3, 4, 5]);
export const MESO_FOCUS_BALANCED = "balanced";

export const MESO_PHASE_LABELS = Object.freeze({
  aufbau: "Aufbau",
  peak: "Peak",
  deload: "Deload"
});

/** Weekly set targets per muscle group (hard sets), by training frequency. */
const BASE_WEEKLY_SETS = Object.freeze({
  3: 10,
  4: 12,
  5: 14
});

/** Session templates: list of body-area sets rotating across the week. */
const SPLITS = Object.freeze({
  3: [
    ["brust", "arme", "bauch"],
    ["ruecken", "arme", "bauch"],
    ["beine", "bauch"]
  ],
  4: [
    ["brust", "arme"],
    ["beine", "bauch"],
    ["ruecken", "arme"],
    ["beine", "bauch"]
  ],
  5: [
    ["brust", "arme"],
    ["ruecken", "arme"],
    ["beine"],
    ["brust", "arme", "bauch"],
    ["ruecken", "beine"]
  ]
});

const localKey = (uid) => `kg_mesocycle_${uid}`;

function clampFrequency(n) {
  const v = Number(n);
  if (MESO_FREQUENCIES.includes(v)) return v;
  return 4;
}

function normalizeFocus(focus) {
  const f = String(focus || MESO_FOCUS_BALANCED);
  if (f === MESO_FOCUS_BALANCED) return MESO_FOCUS_BALANCED;
  return BODY_AREAS.includes(f) ? f : MESO_FOCUS_BALANCED;
}

function emptyVolume() {
  const out = {};
  BODY_AREAS.forEach((b) => { out[b] = 0; });
  return out;
}

function normalizeVolume(raw) {
  const out = emptyVolume();
  if (!raw || typeof raw !== "object") return out;
  BODY_AREAS.forEach((b) => {
    const n = Number(raw[b]);
    out[b] = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  });
  return out;
}

/**
 * Phase prescription for a 1-based week index.
 * @param {number} week
 */
export function getPhaseForWeek(week) {
  const w = Math.min(MESO_DURATION_WEEKS, Math.max(1, Number(week) || 1));
  if (w <= 2) {
    return {
      week: w,
      phase: "aufbau",
      label: MESO_PHASE_LABELS.aufbau,
      volumeMult: 1,
      targetSetsPerExercise: 3,
      targetRirMin: 2,
      targetRirMax: 3,
      loadMult: 1,
      guidance: "Qualität vor Quantität. 2–3 Wdh. Reserve lassen, Technik sauber."
    };
  }
  if (w <= 4) {
    return {
      week: w,
      phase: "peak",
      label: MESO_PHASE_LABELS.peak,
      volumeMult: 1.2,
      targetSetsPerExercise: 4,
      targetRirMin: 1,
      targetRirMax: 2,
      loadMult: 1,
      guidance: "Mehr Sätze, näher am Versagen (RIR 1–2). Erholung und Schlaf priorisieren."
    };
  }
  return {
    week: w,
    phase: "deload",
    label: MESO_PHASE_LABELS.deload,
    volumeMult: 0.55,
    targetSetsPerExercise: 2,
    targetRirMin: 3,
    targetRirMax: 4,
    loadMult: 0.85,
    guidance: "Deload: ~45–60 % Volumen, leichteres Gewicht (~85 %), RIR ≥ 3. Frisch in den nächsten Zyklus."
  };
}

function weeklySetsForPhase(frequency, volumeMult, volumeBonus = 0) {
  const base = (BASE_WEEKLY_SETS[frequency] || BASE_WEEKLY_SETS[4]) + (Number(volumeBonus) || 0);
  return Math.max(4, Math.round(base * volumeMult));
}

/**
 * Bodies for the next session in the current week.
 * Focus muscle is always included when set.
 */
export function bodiesForSession(meso) {
  const frequency = clampFrequency(meso?.frequency);
  const focus = normalizeFocus(meso?.focus);
  const templates = SPLITS[frequency] || SPLITS[4];
  const sessionIndex = Number(meso?.weekSessionsCompleted) || 0;
  const base = [...(templates[sessionIndex % templates.length] || templates[0])];
  if (focus !== MESO_FOCUS_BALANCED && !base.includes(focus)) {
    base.unshift(focus);
  }
  return [...new Set(base)];
}

/**
 * @param {{ frequency?: number, focus?: string, startDate?: number, volumeBonus?: number }} opts
 */
export function createMesocycle(opts = {}) {
  const now = Date.now();
  const frequency = clampFrequency(opts.frequency);
  const focus = normalizeFocus(opts.focus);
  const volumeBonus = Math.max(0, Math.min(6, Number(opts.volumeBonus) || 0));
  const phase = getPhaseForWeek(1);
  return {
    type: "mesocycle",
    name: "Hypertrophie Meso",
    frequency,
    focus,
    durationWeeks: MESO_DURATION_WEEKS,
    startDate: opts.startDate || now,
    currentWeek: 1,
    weekSessionsCompleted: 0,
    totalSessionsCompleted: 0,
    volumeBonus,
    weeklySetTarget: weeklySetsForPhase(frequency, phase.volumeMult, volumeBonus),
    weekVolumeByBody: emptyVolume(),
    status: "active", // active | completed
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Normalize stored object.
 */
export function buildMesocycle(partial = {}) {
  const frequency = clampFrequency(partial.frequency);
  const currentWeek = Math.min(
    MESO_DURATION_WEEKS,
    Math.max(1, Number(partial.currentWeek) || 1)
  );
  const volumeBonus = Math.max(0, Math.min(6, Number(partial.volumeBonus) || 0));
  const phase = getPhaseForWeek(currentWeek);
  return {
    type: "mesocycle",
    name: String(partial.name || "Hypertrophie Meso").slice(0, 60),
    frequency,
    focus: normalizeFocus(partial.focus),
    durationWeeks: MESO_DURATION_WEEKS,
    startDate: Number(partial.startDate) || Date.now(),
    currentWeek,
    weekSessionsCompleted: Math.max(0, Number(partial.weekSessionsCompleted) || 0),
    totalSessionsCompleted: Math.max(0, Number(partial.totalSessionsCompleted) || 0),
    volumeBonus,
    weeklySetTarget: Number(partial.weeklySetTarget) || weeklySetsForPhase(frequency, phase.volumeMult, volumeBonus),
    weekVolumeByBody: normalizeVolume(partial.weekVolumeByBody),
    status: partial.status === "completed" ? "completed" : "active",
    createdAt: Number(partial.createdAt) || Date.now(),
    updatedAt: Date.now()
  };
}

export function loadMesocycle(uid) {
  if (!uid) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(localKey(uid)) || "null");
    if (!raw || raw.type !== "mesocycle") return null;
    return buildMesocycle(raw);
  } catch {
    return null;
  }
}

export function saveMesocycle(uid, meso) {
  if (!uid || !meso) return null;
  const next = buildMesocycle(meso);
  localStorage.setItem(localKey(uid), JSON.stringify(next));
  return next;
}

export function clearMesocycle(uid) {
  if (!uid) return;
  localStorage.removeItem(localKey(uid));
}

export function getActiveMesocycle(uid) {
  const meso = loadMesocycle(uid);
  if (!meso || meso.status !== "active") return null;
  return meso;
}

export function getCompletedMesocycle(uid) {
  const meso = loadMesocycle(uid);
  if (!meso || meso.status !== "completed") return null;
  return meso;
}

/**
 * Weekly volume report: actual hard sets vs target per body.
 */
export function getWeeklyVolumeReport(meso, bodyLabels = {}) {
  if (!meso) return null;
  const phase = getPhaseForWeek(meso.currentWeek);
  const target = weeklySetsForPhase(meso.frequency, phase.volumeMult, meso.volumeBonus);
  const volume = normalizeVolume(meso.weekVolumeByBody);
  const rows = BODY_AREAS.map((body) => {
    const actual = volume[body] || 0;
    const pct = target > 0 ? Math.min(150, Math.round((actual / target) * 100)) : 0;
    let status = "low";
    if (actual >= target) status = "hit";
    else if (actual >= target * 0.7) status = "ok";
    return {
      body,
      label: bodyLabels[body] || body,
      actual,
      target,
      pct,
      status
    };
  });
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalTarget = target * BODY_AREAS.length;
  return {
    week: meso.currentWeek,
    phase: phase.phase,
    phaseLabel: phase.label,
    targetPerBody: target,
    rows,
    totalActual,
    totalTarget,
    overallPct: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0
  };
}

/**
 * Deload / recovery advice for current meso state.
 */
export function getDeloadAdvice(meso) {
  if (!meso || meso.status !== "active") return null;
  const phase = getPhaseForWeek(meso.currentWeek);
  const report = getWeeklyVolumeReport(meso);
  const sessionsLeft = Math.max(0, meso.frequency - (meso.weekSessionsCompleted || 0));

  if (phase.phase === "deload") {
    return {
      level: "deload",
      title: "Deload-Woche",
      text: "Weniger Sätze, leichteres Gewicht (~85 %), RIR 3–4. Ziel ist Erholung — kein PR jagen.",
      loadMult: phase.loadMult
    };
  }

  if (meso.currentWeek === 4 && sessionsLeft <= 1) {
    return {
      level: "upcoming",
      title: "Deload steht bevor",
      text: "Nächste Woche ist Deload. Diese Session noch solide abschließen, dann bewusst runterfahren.",
      loadMult: 1
    };
  }

  if (phase.phase === "peak" && report) {
    const overloaded = report.rows.filter((r) => r.actual > r.target * 1.15);
    if (overloaded.length >= 2) {
      return {
        level: "caution",
        title: "Volumen hoch",
        text: `Mehrere Muskelgruppen über Ziel (${overloaded.map((r) => r.label).join(", ")}). RIR einhalten, ggf. Isolation kürzen.`,
        loadMult: 1
      };
    }
  }

  if (phase.phase === "aufbau" && report?.overallPct >= 90 && sessionsLeft === 0) {
    return {
      level: "ok",
      title: "Woche gut gefüllt",
      text: "Satzziele weitgehend erreicht. Weiter mit sauberer Progression.",
      loadMult: 1
    };
  }

  return {
    level: "info",
    title: phase.label,
    text: phase.guidance,
    loadMult: phase.loadMult
  };
}

/**
 * Full prescription for the next session from an active meso.
 */
export function getSessionPrescription(meso) {
  if (!meso) return null;
  const phase = getPhaseForWeek(meso.currentWeek);
  const report = getWeeklyVolumeReport(meso);
  const advice = getDeloadAdvice(meso);
  return {
    ...phase,
    frequency: meso.frequency,
    focus: meso.focus,
    bodies: bodiesForSession(meso),
    weekSessionsCompleted: meso.weekSessionsCompleted,
    sessionsPerWeek: meso.frequency,
    weeklySetTarget: weeklySetsForPhase(meso.frequency, phase.volumeMult, meso.volumeBonus),
    volumeReport: report,
    advice,
    loadMult: phase.loadMult,
    statusLine: `Woche ${phase.week}/${MESO_DURATION_WEEKS} · ${phase.label} · Session ${Math.min((meso.weekSessionsCompleted || 0) + 1, meso.frequency)}/${meso.frequency}`
  };
}

/**
 * After a completed workout: add set volume, bump session count, roll week when needed.
 * @param {string} uid
 * @param {{ [body: string]: number }|null} setsByBody
 * @param {object|null} meso
 */
export function recordMesocycleSession(uid, setsByBody = null, meso = loadMesocycle(uid)) {
  if (!uid || !meso || meso.status !== "active") {
    return { meso: meso || null, advancedWeek: false, completedMeso: false, prescription: null, volumeReport: null };
  }

  const volume = normalizeVolume(meso.weekVolumeByBody);
  if (setsByBody && typeof setsByBody === "object") {
    Object.entries(setsByBody).forEach(([body, n]) => {
      if (!BODY_AREAS.includes(body)) return;
      const add = Number(n);
      if (!Number.isFinite(add) || add <= 0) return;
      volume[body] = (volume[body] || 0) + Math.round(add);
    });
  }

  let next = buildMesocycle({
    ...meso,
    weekVolumeByBody: volume,
    weekSessionsCompleted: (Number(meso.weekSessionsCompleted) || 0) + 1,
    totalSessionsCompleted: (Number(meso.totalSessionsCompleted) || 0) + 1
  });

  let advancedWeek = false;
  let completedMeso = false;

  if (next.weekSessionsCompleted >= next.frequency) {
    if (next.currentWeek >= MESO_DURATION_WEEKS) {
      next = buildMesocycle({
        ...next,
        status: "completed",
        weekSessionsCompleted: next.frequency
      });
      completedMeso = true;
    } else {
      const newWeek = next.currentWeek + 1;
      const phase = getPhaseForWeek(newWeek);
      next = buildMesocycle({
        ...next,
        currentWeek: newWeek,
        weekSessionsCompleted: 0,
        weekVolumeByBody: emptyVolume(),
        weeklySetTarget: weeklySetsForPhase(next.frequency, phase.volumeMult, next.volumeBonus)
      });
      advancedWeek = true;
    }
  }

  saveMesocycle(uid, next);
  const active = next.status === "active" ? next : meso;
  return {
    meso: next,
    advancedWeek,
    completedMeso,
    prescription: getSessionPrescription(next.status === "active" ? next : buildMesocycle({ ...meso, weekVolumeByBody: volume })),
    volumeReport: getWeeklyVolumeReport(next.status === "active" ? next : buildMesocycle({ ...next, weekVolumeByBody: volume }))
  };
}

/**
 * Start a new meso after completion — slight volume bump (+1 set/muscle baseline).
 */
export function startNextMesocycle(uid, previous = loadMesocycle(uid)) {
  const prev = previous || {};
  const next = createMesocycle({
    frequency: prev.frequency || 4,
    focus: prev.focus || MESO_FOCUS_BALANCED,
    volumeBonus: Math.min(6, (Number(prev.volumeBonus) || 0) + 1)
  });
  return saveMesocycle(uid, next);
}

/**
 * Adjust last-session weight suggestion for meso phase (esp. deload).
 */
export function applyPhaseLoad(weight, mesoOrRx) {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) return weight;
  const mult = Number(mesoOrRx?.loadMult);
  if (!Number.isFinite(mult) || mult === 1) return Math.round(w * 2) / 2;
  const next = w * mult;
  // round to 0.5 kg
  return Math.round(next * 2) / 2;
}

export function focusLabel(focus, bodyLabels = {}) {
  const f = normalizeFocus(focus);
  if (f === MESO_FOCUS_BALANCED) return "Ausgeglichen";
  return bodyLabels[f] || f;
}

/** HTML helpers kept tiny — used by training UI. */
export function renderVolumeBarsHtml(report) {
  if (!report?.rows?.length) return "";
  return `
    <div class="meso-volume">
      <div class="meso-banner-title">Wochenvolumen (Sätze)</div>
      <div class="sub" style="margin:4px 0 8px">Ziel ~${report.targetPerBody} Sätze / Muskel · Ist gesamt ${report.totalActual}</div>
      ${report.rows.map((r) => `
        <div class="meso-vol-row">
          <div class="meso-vol-label">${r.label}<span>${r.actual}/${r.target}</span></div>
          <div class="meso-vol-track" aria-hidden="true"><span class="meso-vol-fill meso-vol-fill--${r.status}" style="width:${Math.min(100, r.pct)}%"></span></div>
        </div>`).join("")}
    </div>`;
}

export function renderAdviceHtml(advice) {
  if (!advice) return "";
  return `
    <div class="meso-advice meso-advice--${advice.level || "info"}" role="status">
      <div class="meso-banner-title">${advice.title}</div>
      <div class="sub" style="margin-top:4px">${advice.text}</div>
    </div>`;
}
