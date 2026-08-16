import { ref, get, set, remove, push } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "./firebase.js";
import { getAuthSnapshot } from "./auth.js";
import { Paths, safeUserKey as modelSafeUserKey } from "./data-model.js";
import { BODY_LABELS as DATA_BODY_LABELS, LEVEL_LABELS, LEVEL_ORDER, LEVEL_DESC, GOAL_ORDER, GOAL_LABELS, GOAL_DESC, CARDIO_OPTIONS, EQUIPMENT_TIPS } from "./data.js";
import {
  isOnline,
  enqueueWrite,
  mergeLogIntoCache,
  cacheLogTree,
  readCachedLogTree,
  cacheLastWorkout,
  readCachedLastWorkout,
  cacheActiveSession,
  clearCachedActiveSession,
  syncPendingWrites,
  pendingCount,
  withTimeout
} from "./offline.js";
import {
  MESO_FREQUENCIES,
  MESO_FOCUS_BALANCED,
  MESO_DURATION_WEEKS,
  createMesocycle,
  getActiveMesocycle,
  getCompletedMesocycle,
  getSessionPrescription,
  getDeloadAdvice,
  saveMesocycle,
  clearMesocycle,
  recordMesocycleSession,
  startNextMesocycle,
  applyPhaseLoad,
  focusLabel as mesoFocusLabel,
  renderVolumeBarsHtml,
  renderAdviceHtml
} from "./mesocycle.js";
import {
  BODYMAP_FRONT_VIEWBOX,
  BODYMAP_BACK_VIEWBOX,
  BODYMAP_FRONT_MUSCLES,
  BODYMAP_FRONT_STATIC,
  BODYMAP_FRONT_OUTLINE,
  BODYMAP_BACK_MUSCLES,
  BODYMAP_BACK_STATIC,
  BODYMAP_BACK_OUTLINE
} from "./bodymap-assets.js";

export function createTrainingModule(ctx = {}) {
  const BODY_LABELS = ctx.BODY_LABELS || ctx.bodyLabels || DATA_BODY_LABELS;
  const showToast = ctx.showToast || (() => {});
  const refreshConnectivityBanner = ctx.refreshConnectivityBanner || (() => {});
  const recordWorkoutCompletion = ctx.recordWorkoutCompletion || (async () => {});
  const getAllExercises = ctx.getAllExercises || ctx.exercises?.getAllExercises;
  const findExercise = ctx.findExercise || ctx.exercises?.findExercise;
  const loadCustomExercises = ctx.loadCustomExercises || ctx.exercises?.loadCustomExercises;
  const getExerciseOverrides = ctx.getExerciseOverrides || ctx.exercises?.getExerciseOverrides;
  const getExerciseDisplay = ctx.getExerciseDisplay || ctx.exercises?.getExerciseDisplay;
  const renderExerciseMediaHtml = ctx.renderExerciseMediaHtml || ctx.exercises?.renderExerciseMediaHtml;
  const initExerciseMediaFallbacks = ctx.initExerciseMediaFallbacks || ctx.exercises?.initExerciseMediaFallbacks;
  const levelsUpTo = ctx.levelsUpTo || ctx.exercises?.levelsUpTo;

  let trainingUser = String(ctx.getTrainingUser?.() || "").trim();
  let growthMvpInitialized = !!ctx.getGrowthMvpInitialized?.();
  /** Owner may inspect another account key (uid or legacy name). */
  let ownerViewKey = null;

  function syncTrainingUser() {
    trainingUser = String(ctx.getTrainingUser?.() || "").trim();
    return trainingUser;
  }

  function updateTrainingUser(name) {
    trainingUser = String(name || "").trim();
    ctx.setTrainingUser?.(trainingUser);
  }

  function updateGrowthMvpInitialized(value) {
    growthMvpInitialized = !!value;
    ctx.setGrowthMvpInitialized?.(growthMvpInitialized);
  }

  function safeUserKey(user) {
    return modelSafeUserKey(user);
  }

  function account() {
    const snap = getAuthSnapshot();
    return {
      uid: snap.uid,
      isPermanent: !!snap.isPermanent,
      email: snap.email || "",
      isOwner: !!ctx.getIsOwner?.()
    };
  }

  /** Storage key for writes — always own uid when logged in. */
  function writeKey() {
    const { uid, isPermanent } = account();
    if (!isPermanent || !uid) return null;
    return uid;
  }

  /** Storage key for reads — own uid, or ownerViewKey when owner inspects someone. */
  function readKey() {
    const { isOwner } = account();
    if (isOwner && ownerViewKey) return ownerViewKey;
    return writeKey();
  }

  function requireLoginHtml() {
    return `
      <div class="training-guest-card">
        <div class="training-guest-kicker">Training</div>
        <div class="training-guest-title">Anmelden zum Starten</div>
        <p class="sub">Speichere Sätze, Fortschritt und Streaks an deinem Konto — auch offline im Keller.</p>
        <button type="button" id="trainingGoLoginBtn" class="btn-main btn-lime">Anmelden →</button>
      </div>`;
  }

  /* ============ TRAININGSDATEN EXPORT ============ */
  async function exportUserDataAsCSV(user) {
    try {
      const history = await getFullUserHistory(user);
      let rows = [["Übung","Datum","Gewicht (kg)","Wiederholungen","Min Wdh Ziel","Max Wdh Ziel","Rack/Jammer-Einstellung"]];
      Object.entries(history).forEach(([exId, entries]) => {
        entries.forEach(e => {
          const d = new Date(e.date).toLocaleString("de-DE");
          rows.push([e.exerciseName || exId, d, e.weight ?? "", e.reps ?? "", e.minReps ?? "", e.maxReps ?? "", e.rackSetting != null ? e.rackSetting : ""]);
        });
      });
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kellerkraft_${user}_export_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Trainingsdaten wurden exportiert.", "success");
    } catch (err) {
      showToast("Export fehlgeschlagen: " + (err?.message || "Unbekannter Fehler"), "error");
    }
  }

  /* ============ MUSKELGRUPPEN-VISUALISIERUNG ============ */
  const BODY_TO_FRONT_IDS = {
    beine: ["f-quad-l", "f-quad-r", "f-calf-l", "f-calf-r"],
    bauch: ["f-abs"],
    arme: ["f-bicep-l", "f-bicep-r", "f-shoulder-l", "f-shoulder-r"],
    brust: ["f-chest"]
  };
  const BODY_TO_BACK_IDS = {
    beine: ["b-ham-l", "b-ham-r", "b-glute-l", "b-glute-r", "b-calf-l", "b-calf-r"],
    arme: ["b-tricep-l", "b-tricep-r", "b-shoulder-l", "b-shoulder-r"],
    ruecken: ["b-lat-l", "b-lat-r", "b-trap", "b-lower"]
  };

  function setsVolumeKg(sets) {
    if (!Array.isArray(sets) || !sets.length) return 0;
    return sets.reduce((sum, s) => {
      const w = Number(s?.weight) || 0;
      const r = Number(s?.reps) || 0;
      return sum + (w * r);
    }, 0);
  }

  function formatMovedKg(kg) {
    const n = Math.round(Number(kg) || 0);
    return n.toLocaleString("de-DE");
  }

  function renderWorkoutCompleteSummary({ finishedCount, bodyList, volumeKg, setCount, mesoProgress = null }) {
    const regions = bodyList.map((b) => BODY_LABELS[b] || b);
    const regionChips = regions.length
      ? `<div class="workout-body-chips">${regions.map((label) =>
          `<span class="workout-body-chip">${label}</span>`
        ).join("")}</div>`
      : `<div class="sub" style="margin-top:10px">Keine Muskelgruppe erfasst.</div>`;

    let mesoHtml = "";
    if (mesoProgress?.completedMeso) {
      mesoHtml = `
        <div class="meso-status-card" style="margin-top:14px">
          <div class="meso-banner-title">Mesozyklus geschafft</div>
          <div class="sub" style="margin-top:4px">Deload abgeschlossen. Nächster Zyklus startet mit etwas mehr Wochenvolumen.</div>
          <button type="button" id="mesoStartNextBtn" class="btn-main btn-lime" style="margin-top:10px">Neuen Mesozyklus starten →</button>
        </div>`;
    } else if (mesoProgress?.meso?.status === "active") {
      const rx = getSessionPrescription(mesoProgress.meso);
      const advanceNote = mesoProgress.advancedWeek
        ? ` Neue Woche: ${rx?.label || ""}.`
        : "";
      const advice = mesoProgress.advancedWeek ? getDeloadAdvice(mesoProgress.meso) : (rx?.advice || null);
      mesoHtml = `
        <div class="meso-status-card" style="margin-top:14px">
          <div class="meso-banner-title">Mesozyklus · Fortschritt</div>
          <div class="sub" style="margin-top:4px">${rx?.statusLine || ""}${advanceNote}</div>
          ${renderVolumeBarsHtml(mesoProgress.volumeReport || rx?.volumeReport)}
          ${renderAdviceHtml(advice)}
        </div>`;
    }

    return `
      <div class="workout-complete">
        <div class="workout-complete-kicker">Session beendet</div>
        <div class="workout-complete-title">Starke Einheit</div>
        <div class="sub workout-complete-sub">${finishedCount} Übung${finishedCount === 1 ? "" : "en"} abgeschlossen</div>

        <div id="workoutSyncPanel" class="workout-sync-card" aria-live="polite">
          <div class="workout-sync-title">Speichern</div>
          <p>Prüfe Sync-Status…</p>
        </div>

        ${mesoHtml}

        <div class="workout-tonnage-card">
          <div class="workout-tonnage-label">Bewegte Last</div>
          <div class="workout-tonnage-value">${formatMovedKg(volumeKg)} <span>kg</span></div>
          <div class="workout-tonnage-hint">Summe aus Gewicht × Wiederholungen aller Sätze</div>
        </div>

        <div class="workout-stat-row">
          <div class="workout-stat">
            <div class="workout-stat-value">${finishedCount}</div>
            <div class="workout-stat-label">Übungen</div>
          </div>
          <div class="workout-stat">
            <div class="workout-stat-value">${setCount}</div>
            <div class="workout-stat-label">Sätze</div>
          </div>
          <div class="workout-stat">
            <div class="workout-stat-value">${regions.length}</div>
            <div class="workout-stat-label">Regionen</div>
          </div>
        </div>

        <div class="workout-muscle-panel">
          <div class="workout-muscle-heading">Trainierte Körperregionen</div>
          ${renderMuscleSVG(bodyList)}
          ${regionChips}
        </div>

        <button id="restartTrainingBtn" class="btn-main btn-lime" style="margin-top:18px">Neues Workout starten →</button>
        <button id="backFromCompleteBtn" class="btn-main btn-dark" style="margin-top:8px">Zur Trainingsübersicht</button>
      </div>`;
  }

  function renderMuscleSVG(activeBodies) {
    const frontIds = new Set();
    const backIds = new Set();
    activeBodies.forEach((b) => {
      (BODY_TO_FRONT_IDS[b] || []).forEach((id) => frontIds.add(id));
      (BODY_TO_BACK_IDS[b] || []).forEach((id) => backIds.add(id));
    });
    const cls = (set, id) => (set.has(id) ? "muscle active" : "muscle");
    const frontStatic = BODYMAP_FRONT_STATIC.map((p) =>
      `<path class="muscle-static" d="${p.d}"/>`
    ).join("");
    const frontMuscles = BODYMAP_FRONT_MUSCLES.map((p) =>
      `<path class="${cls(frontIds, p.id)}" data-region="${p.id}" d="${p.d}"/>`
    ).join("");
    const backStatic = BODYMAP_BACK_STATIC.map((p) =>
      `<path class="muscle-static" d="${p.d}"/>`
    ).join("");
    const backMuscles = BODYMAP_BACK_MUSCLES.map((p) =>
      `<path class="${cls(backIds, p.id)}" data-region="${p.id}" d="${p.d}"/>`
    ).join("");

    return `
      <div class="muscle-view-grid">
        <div class="muscle-view-card">
          <div class="muscle-view-label">Vorne</div>
          <div class="muscle-svg-frame">
            <svg class="muscle-svg" viewBox="${BODYMAP_FRONT_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path class="muscle-outline" d="${BODYMAP_FRONT_OUTLINE}"/>
              ${frontStatic}
              ${frontMuscles}
            </svg>
          </div>
        </div>
        <div class="muscle-view-card">
          <div class="muscle-view-label">Hinten</div>
          <div class="muscle-svg-frame">
            <svg class="muscle-svg" viewBox="${BODYMAP_BACK_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path class="muscle-outline" d="${BODYMAP_BACK_OUTLINE}"/>
              ${backStatic}
              ${backMuscles}
            </svg>
          </div>
        </div>
      </div>
      <div class="muscle-legend">
        <span class="muscle-legend-item"><span class="legend-dot active"></span> Trainiert</span>
        <span class="muscle-legend-item"><span class="legend-dot"></span> Nicht trainiert</span>
      </div>`;
  }

  function setWorkoutProgress(current, total) {
    const bar = document.getElementById("workoutProgressBar");
    if (!bar) return;
    if (!total || total <= 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const label = document.getElementById("workoutProgressLabel");
    const fill = document.getElementById("workoutProgressFill");
    if (label) label.textContent = `Übung ${current} / ${total}`;
    if (fill) fill.style.width = `${Math.min(100, (current / total) * 100)}%`;
  }

  function hideWorkoutProgress() {
    const bar = document.getElementById("workoutProgressBar");
    if (bar) bar.hidden = true;
    stopSetRestTimer();
    document.body.classList.remove("workout-session-active");
  }

  let setRestTimerInterval = null;
  let setRestRemaining = 0;
  let setRestPaused = false;

  function stopSetRestTimer() {
    clearInterval(setRestTimerInterval);
    setRestTimerInterval = null;
    setRestPaused = false;
    const bar = document.getElementById("setRestBar");
    if (bar) {
      bar.hidden = true;
      bar.classList.remove("is-done");
    }
  }

  function getSavedRestDuration() {
    const saved = parseInt(localStorage.getItem("kg_rest_duration"), 10);
    return Number.isFinite(saved) && saved > 0 ? saved : 90;
  }

  function startSetRestTimer({ setNumber } = {}) {
    clearInterval(setRestTimerInterval);
    setRestPaused = false;
    const duration = getSavedRestDuration();
    setRestRemaining = duration;

    const bar = document.getElementById("setRestBar");
    const display = document.getElementById("setRestDisplay");
    const label = document.getElementById("setRestLabel");
    const pauseBtn = document.getElementById("setRestPauseBtn");
    const skipBtn = document.getElementById("setRestSkipBtn");
    const durRow = document.getElementById("setRestDurRow");
    if (!bar || !display || !pauseBtn || !skipBtn || !durRow) return;

    bar.hidden = false;
    bar.classList.remove("is-done");
    if (label) {
      label.textContent = setNumber
        ? `Pause nach Satz ${setNumber}`
        : "Pause bis nächster Satz";
    }
    display.textContent = formatRestTime(setRestRemaining);
    pauseBtn.textContent = "⏸";
    pauseBtn.setAttribute("aria-label", "Pause pausieren");

    durRow.innerHTML = [30, 60, 90, 120].map((s) =>
      `<button type="button" class="btn-dur${s === duration ? " active" : ""}" data-sec="${s}">${s}s</button>`
    ).join("");

    function onFinished() {
      clearInterval(setRestTimerInterval);
      setRestTimerInterval = null;
      setRestRemaining = 0;
      display.textContent = "0:00";
      bar.classList.add("is-done");
      if (label) label.textContent = "Pause vorbei — nächster Satz";
      showToast("Pause beendet – nächster Satz!", "success", 2500);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }

    function tick() {
      if (setRestPaused) return;
      setRestRemaining -= 1;
      if (setRestRemaining <= 0) {
        onFinished();
        return;
      }
      display.textContent = formatRestTime(setRestRemaining);
    }
    setRestTimerInterval = setInterval(tick, 1000);

    durRow.querySelectorAll(".btn-dur").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sec = parseInt(btn.dataset.sec, 10);
        if (!Number.isFinite(sec)) return;
        localStorage.setItem("kg_rest_duration", String(sec));
        setRestRemaining = sec;
        bar.classList.remove("is-done");
        display.textContent = formatRestTime(setRestRemaining);
        if (label) {
          label.textContent = setNumber
            ? `Pause nach Satz ${setNumber}`
            : "Pause bis nächster Satz";
        }
        durRow.querySelectorAll(".btn-dur").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        if (!setRestTimerInterval) {
          setRestTimerInterval = setInterval(tick, 1000);
        }
      });
    });

    pauseBtn.onclick = () => {
      if (setRestRemaining <= 0) return;
      setRestPaused = !setRestPaused;
      pauseBtn.textContent = setRestPaused ? "▶" : "⏸";
      pauseBtn.setAttribute("aria-label", setRestPaused ? "Pause fortsetzen" : "Pause pausieren");
    };

    skipBtn.onclick = () => {
      stopSetRestTimer();
    };
  }
  let selectedBody = new Set();
  let selectedLevel = null;
  let selectedDuration = 30;
  let selectedGoal = "muskelaufbau";
  /** null = undecided, true/false after user picks */
  let cardioEnabled = null;
  let selectedCardio = new Set();
  /** Opt-in for structured hypertrophy mesocycle (independent from AI workout). */
  let mesoOptIn = false;
  let mesoFrequency = 4;
  let mesoFocus = MESO_FOCUS_BALANCED;
  /** Prescription snapshot for the running session (null = normal AI workout). */
  let activeMesoRx = null;
  /** Hard sets per body accumulated in the current meso session. */
  let sessionMesoSetsByBody = {};
  let currentWorkoutQueue = [];
  let currentExerciseIdx = 0;
  let completedBodies = new Set();
  let currentSets = []; // Saetze der aktuell angezeigten Uebung: [{weight, reps}, ...]
  let sessionOverrides = {};
  /** Once true, never block the exercise UI on a network overrides fetch. */
  let sessionOverridesReady = false;
  /** warmup | exercise | rest — where the athlete left off */
  let sessionPhase = "exercise";
  let pendingRestoredSets = null;
  let sessionAutosaveBound = false;
  /** Summe Gewicht×Wdh. über alle protokollierten Sätze dieser Session */
  let sessionVolumeKg = 0;
  let sessionSetCount = 0;
  const ACTIVE_SESSION_KEY = "kg_active_training_session_v1";
  const OVERRIDES_CACHE_KEY = "kg_exercise_overrides_cache_v1";
  const SETUP_PREFS_KEY = "kg_setup_prefs_v1";
  const SESSION_MAX_AGE_MS = 18 * 60 * 60 * 1000;

  function saveSetupPrefs() {
    try {
      localStorage.setItem(SETUP_PREFS_KEY, JSON.stringify({
        duration: selectedDuration,
        body: [...selectedBody],
        level: selectedLevel,
        goal: selectedGoal,
        cardioEnabled,
        cardio: [...selectedCardio],
        mesoOptIn,
        mesoFrequency,
        mesoFocus,
        savedAt: Date.now()
      }));
    } catch { /* ignore */ }
  }

  function loadSetupPrefs() {
    try {
      const raw = localStorage.getItem(SETUP_PREFS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function applySetupPrefs(prefs) {
    if (!prefs) return;
    if (Number.isFinite(prefs.duration)) selectedDuration = prefs.duration;
    if (Array.isArray(prefs.body)) selectedBody = new Set(prefs.body);
    if (prefs.level) selectedLevel = prefs.level;
    if (prefs.goal) selectedGoal = prefs.goal;
    if (prefs.cardioEnabled === true || prefs.cardioEnabled === false) cardioEnabled = prefs.cardioEnabled;
    if (Array.isArray(prefs.cardio)) selectedCardio = new Set(prefs.cardio);
    if (typeof prefs.mesoOptIn === "boolean") mesoOptIn = prefs.mesoOptIn;
    if (MESO_FREQUENCIES.includes(Number(prefs.mesoFrequency))) mesoFrequency = Number(prefs.mesoFrequency);
    if (prefs.mesoFocus) mesoFocus = prefs.mesoFocus;
  }

  function readOverridesCacheSync() {
    try {
      return JSON.parse(localStorage.getItem(OVERRIDES_CACHE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  async function prepareSessionOverrides() {
    try {
      sessionOverrides = (await getExerciseOverrides()) || {};
    } catch {
      sessionOverrides = readOverridesCacheSync();
    }
    sessionOverridesReady = true;
    return sessionOverrides;
  }

  /** Sync only — never awaits Firebase (warmup → exercise must work offline). */
  function overridesForExerciseUi() {
    if (sessionOverridesReady) return sessionOverrides || {};
    sessionOverrides = readOverridesCacheSync();
    sessionOverridesReady = true;
    return sessionOverrides;
  }

  function isSessionFresh(savedAt) {
    if (!Number.isFinite(savedAt) || savedAt <= 0) return true;
    return (Date.now() - savedAt) <= SESSION_MAX_AGE_MS;
  }

  function saveActiveSession() {
    if (!Array.isArray(currentWorkoutQueue) || currentWorkoutQueue.length === 0) return;
    try {
      const payload = {
        selectedDuration,
        selectedGoal,
        cardioEnabled,
        selectedCardio: [...selectedCardio],
        mesoOptIn,
        mesoFrequency,
        mesoFocus,
        activeMesoRx,
        sessionMesoSetsByBody,
        queue: currentWorkoutQueue,
        index: currentExerciseIdx,
        completedBodies: [...completedBodies],
        currentSets: Array.isArray(currentSets) ? currentSets : [],
        phase: sessionPhase || "exercise",
        sessionVolumeKg: Number(sessionVolumeKg) || 0,
        sessionSetCount: Number(sessionSetCount) || 0,
        sessionOverrides: sessionOverrides || {},
        sessionOverridesReady: true,
        savedAt: Date.now()
      };
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(payload));
      void cacheActiveSession(payload);
    } catch {
      // ignore localStorage errors
    }
    refreshConnectivityBanner();
  }

  function clearActiveSession() {
    try {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {
      // ignore
    }
    void clearCachedActiveSession();
    sessionOverridesReady = false;
    sessionPhase = "exercise";
    pendingRestoredSets = null;
    currentSets = [];
    sessionVolumeKg = 0;
    sessionSetCount = 0;
    activeMesoRx = null;
    sessionMesoSetsByBody = {};
    refreshConnectivityBanner();
  }

  function readStoredSession() {
    try {
      const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.queue) || !s.queue.length) return null;
      if (!isSessionFresh(s.savedAt)) {
        clearActiveSession();
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  function hasActiveSession() {
    if (
      Array.isArray(currentWorkoutQueue) &&
      currentWorkoutQueue.length > 0 &&
      currentExerciseIdx < currentWorkoutQueue.length
    ) {
      return true;
    }
    return !!readStoredSession();
  }

  function restoreActiveSession() {
    try {
      if (Array.isArray(currentWorkoutQueue) && currentWorkoutQueue.length > 0) {
        return true;
      }
      const s = readStoredSession();
      if (!s) return false;
      currentWorkoutQueue = s.queue;
      currentExerciseIdx = Math.max(0, Number(s.index || 0));
      if (currentExerciseIdx >= currentWorkoutQueue.length) {
        currentExerciseIdx = Math.max(0, currentWorkoutQueue.length - 1);
      }
      completedBodies = new Set(Array.isArray(s.completedBodies) ? s.completedBodies : []);
      if (Number.isFinite(s.selectedDuration)) selectedDuration = s.selectedDuration;
      if (s.selectedGoal) selectedGoal = s.selectedGoal;
      cardioEnabled = s.cardioEnabled === true ? true : (s.cardioEnabled === false ? false : null);
      selectedCardio = new Set(Array.isArray(s.selectedCardio) ? s.selectedCardio : []);
      mesoOptIn = !!s.mesoOptIn;
      if (MESO_FREQUENCIES.includes(Number(s.mesoFrequency))) mesoFrequency = Number(s.mesoFrequency);
      if (s.mesoFocus) mesoFocus = s.mesoFocus;
      activeMesoRx = s.activeMesoRx && typeof s.activeMesoRx === "object" ? s.activeMesoRx : null;
      sessionMesoSetsByBody = (s.sessionMesoSetsByBody && typeof s.sessionMesoSetsByBody === "object")
        ? { ...s.sessionMesoSetsByBody }
        : {};
      const restoredSets = Array.isArray(s.currentSets) ? s.currentSets.filter(Boolean) : [];
      currentSets = restoredSets;
      pendingRestoredSets = restoredSets;
      sessionPhase = (s.phase === "warmup" || s.phase === "rest" || s.phase === "exercise")
        ? s.phase
        : "exercise";
      sessionVolumeKg = Number.isFinite(Number(s.sessionVolumeKg)) ? Number(s.sessionVolumeKg) : 0;
      sessionSetCount = Number.isFinite(Number(s.sessionSetCount)) ? Number(s.sessionSetCount) : 0;
      if (s.sessionOverrides && typeof s.sessionOverrides === "object") {
        sessionOverrides = s.sessionOverrides;
        sessionOverridesReady = true;
      } else {
        sessionOverrides = readOverridesCacheSync();
        sessionOverridesReady = true;
      }
      return true;
    } catch {
      return false;
    }
  }

  function resumeActiveTraining() {
    if (!restoreActiveSession()) return false;
    if (sessionPhase === "warmup") {
      renderWarmup();
      return true;
    }
    if (sessionPhase === "rest") {
      renderRestTimer();
      return true;
    }
    renderTrainingExercise();
    return true;
  }

  function abandonActiveTraining() {
    clearInterval(restTimerInterval);
    stopSetRestTimer();
    hideWorkoutProgress();
    currentWorkoutQueue = [];
    currentExerciseIdx = 0;
    completedBodies = new Set();
    sessionVolumeKg = 0;
    sessionSetCount = 0;
    clearActiveSession();
  }

  function bindSessionAutosave() {
    if (sessionAutosaveBound) return;
    sessionAutosaveBound = true;
    const persist = () => {
      if (currentWorkoutQueue.length > 0) saveActiveSession();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persist();
    });
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", persist);
  }
  bindSessionAutosave();

  const WARMUP_EXAMPLES = [
    "Hyperextensions am Ab & Back Trainer – 1 x 12 (locker, ohne Zusatzgewicht)",
    "Kniebeugen (Bodyweight) – 1–2 x 15",
    "Widerstandsbänder dehnen – Arme, Schultern, Hüfte je 30 Sek.",
    "Armkreisen vorwärts/rückwärts – je 15 Wiederholungen",
    "Hüftkreisen & leichte Ausfallschritte – je 10 pro Seite",
    "Lat Pulldown mit sehr leichtem Gewicht – 1 x 15 zum Aktivieren des Rückens"
  ];

  function exercisesPerDuration(min) {
    if (min <= 20) return 3;
    if (min <= 35) return 5;
    if (min <= 50) return 6;
    return 8;
  }

  function isCardioStep(item) {
    return Boolean(item && item.type === "cardio");
  }

  function strengthIdsFromQueue(queue = currentWorkoutQueue) {
    return queue.filter((e) => e && !isCardioStep(e) && e.id).map((e) => e.id);
  }

  function scoreExerciseForGoal(ex, goal) {
    let score = 1;
    const bias = Array.isArray(ex.goalBias) ? ex.goalBias : [];
    const pattern = ex.pattern || "isolation";
    const defMax = ex.defMax ?? 12;

    if (bias.includes(goal)) score += 4;
    else score -= 1;

    if (goal === "kraft") {
      if (pattern === "compound") score += 3;
      if (defMax <= 10) score += 2;
      if (pattern === "isolation") score -= 2;
      if (defMax >= 15) score -= 2;
    } else if (goal === "muskelaufbau") {
      if (pattern === "compound") score += 1;
      if (pattern === "isolation") score += 1;
      if (defMax >= 8 && defMax <= 15) score += 1;
    } else if (goal === "abnehmen") {
      if (defMax >= 12) score += 2;
      if (pattern === "isolation") score += 1;
      if (pattern === "compound" && defMax <= 8) score -= 2;
      if (bias.includes("abnehmen")) score += 1;
    }
    return score;
  }

  function makeCardioStep(optionId, goal) {
    const opt = CARDIO_OPTIONS.find((c) => c.id === optionId) || CARDIO_OPTIONS[0];
    const minutes = (opt.minutes && opt.minutes[goal]) || (opt.minutes && opt.minutes.muskelaufbau) || 10;
    return {
      type: "cardio",
      id: `cardio_${opt.id}`,
      cardioId: opt.id,
      name: opt.label,
      body: "cardio",
      minutes,
      note: `${minutes} Min. ${opt.label} — lockeres Tempo, als Finisher nach dem Kraftteil.`
    };
  }

  function appendCardioFinisher(queue) {
    if (cardioEnabled !== true || selectedCardio.size === 0) return queue;
    const ids = [...selectedCardio];
    const pick = ids[Math.floor(Math.random() * ids.length)];
    return [...queue, makeCardioStep(pick, selectedGoal || "muskelaufbau")];
  }

  function buildWorkout() {
    const goal = selectedGoal || "muskelaufbau";
    const allowedLevels = levelsUpTo(selectedLevel || "advanced");
    const all = getAllExercises();
    let pool = all.filter(e => selectedBody.has(e.body) && allowedLevels.includes(e.level));
    if (pool.length === 0) pool = all.filter(e => allowedLevels.includes(e.level));
    const count = Math.min(exercisesPerDuration(selectedDuration), pool.length || 1);

    const scored = pool.map((e) => ({ e, score: scoreExerciseForGoal(e, goal) }));
    scored.sort((a, b) => b.score - a.score || Math.random() - 0.5);
    const topCut = Math.max(count, Math.ceil(scored.length * 0.6));
    const candidates = scored.slice(0, topCut).map((x) => x.e);
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);

    const byBody = {};
    const result = [];
    shuffled.forEach((e) => { if (!byBody[e.body]) { byBody[e.body] = true; result.push(e); } });
    shuffled.forEach((e) => { if (result.length < count && !result.includes(e)) result.push(e); });
    // Prefer mixing compound+isolation for hypertrophy when possible
    if (goal === "muskelaufbau" && result.length >= 2) {
      const hasCompound = result.some((e) => e.pattern === "compound");
      const hasIsolation = result.some((e) => e.pattern === "isolation");
      if (!hasIsolation) {
        const iso = shuffled.find((e) => e.pattern === "isolation" && !result.includes(e));
        if (iso) result[result.length - 1] = iso;
      } else if (!hasCompound) {
        const comp = shuffled.find((e) => e.pattern === "compound" && !result.includes(e));
        if (comp) result[0] = comp;
      }
    }

    return appendCardioFinisher(result.slice(0, count));
  }

  /**
   * Ensure an active meso exists and load today's prescription into activeMesoRx.
   * @returns {object|null} prescription or null
   */
  function ensureActiveMesoRx() {
    const uid = writeKey();
    if (!uid) return null;
    let meso = getActiveMesocycle(uid);
    if (!meso) {
      meso = saveMesocycle(uid, createMesocycle({
        frequency: mesoFrequency,
        focus: mesoFocus
      }));
    }
    activeMesoRx = getSessionPrescription(meso);
    selectedGoal = "muskelaufbau";
    return activeMesoRx;
  }

  /** Tag queue exercises with current meso set/RIR/phase targets (keeps exercise order). */
  function applyMesoTagsToQueue(queue) {
    if (!activeMesoRx || !Array.isArray(queue)) return queue || [];
    return queue.map((ex) => {
      if (!ex || isCardioStep(ex)) return ex;
      return {
        ...ex,
        mesoTargetSets: activeMesoRx.targetSetsPerExercise,
        mesoTargetRirMin: activeMesoRx.targetRirMin,
        mesoTargetRirMax: activeMesoRx.targetRirMax,
        mesoPhase: activeMesoRx.phase,
        mesoPhaseLabel: activeMesoRx.label,
        mesoWeek: activeMesoRx.week,
        mesoGuidance: activeMesoRx.guidance,
        mesoLoadMult: activeMesoRx.loadMult
      };
    });
  }

  /**
   * Build today's session from the active (or newly created) hypertrophy meso.
   * Offline-safe: meso lives in localStorage.
   */
  function buildMesocycleSession() {
    ensureActiveMesoRx();
    selectedBody = new Set(activeMesoRx.bodies);
    const queue = buildWorkout();
    return applyMesoTagsToQueue(queue);
  }

  /**
   * Start a custom workout; if Meso is opted-in / active, keep YOUR exercises
   * but apply phase sets, RIR targets and deload load guidance.
   */
  function startCustomWorkoutWithOptionalMeso(exerciseIds) {
    const queue = (exerciseIds || []).map((id) => findExercise(id)).filter(Boolean);
    if (!queue.length) return null;

    const uid = writeKey();
    const wantMeso = mesoOptIn || !!getActiveMesocycle(uid);
    if (wantMeso) {
      mesoOptIn = true;
      ensureActiveMesoRx();
      sessionMesoSetsByBody = {};
      return applyMesoTagsToQueue(queue);
    }
    activeMesoRx = null;
    sessionMesoSetsByBody = {};
    return queue;
  }

  function mesoBannerHtml(ex = null) {
    const rx = activeMesoRx || (ex && ex.mesoPhase ? {
      statusLine: `Woche ${ex.mesoWeek}/${MESO_DURATION_WEEKS} · ${ex.mesoPhaseLabel}`,
      targetSetsPerExercise: ex.mesoTargetSets,
      targetRirMin: ex.mesoTargetRirMin,
      targetRirMax: ex.mesoTargetRirMax,
      label: ex.mesoPhaseLabel,
      guidance: ex.mesoGuidance || ""
    } : null);
    if (!rx) return "";
    const sets = ex?.mesoTargetSets ?? rx.targetSetsPerExercise;
    const rMin = ex?.mesoTargetRirMin ?? rx.targetRirMin;
    const rMax = ex?.mesoTargetRirMax ?? rx.targetRirMax;
    const guidance = rx.guidance || activeMesoRx?.guidance || "";
    return `
      <div class="meso-banner" role="status">
        <div class="meso-banner-title">Mesozyklus · ${rx.statusLine || rx.label || "Hypertrophie"}</div>
        <div class="meso-banner-sub">Soll: <strong>${sets}</strong> Arbeitssätze · Ziel-RIR <strong>${rMin}–${rMax}</strong>${rx.loadMult && rx.loadMult < 1 ? ` · Last ~<strong>${Math.round(rx.loadMult * 100)} %</strong>` : ""}</div>
        ${guidance ? `<div class="sub" style="margin-top:6px">${guidance}</div>` : ""}
      </div>`;
  }

  function exerciseSetupHint(ex) {
    if (!ex) return "";
    if (isCardioStep(ex)) {
      return `${ex.minutes || 10} Min. ${ex.name} — Ort/Gerät vorbereiten.`;
    }
    if (ex.id === "nordic") {
      return "Latzug-Rolle tief · Matte unter Knie · Füße unter Rolle";
    }
    const equip = Array.isArray(ex.equip) ? ex.equip : [];
    const hints = [];
    if (ex.rackSetting || ex.rackLabel) {
      hints.push(`Rack vorbereiten: ${ex.rackLabel || "J-Hooks / Safety Arms"}`);
    }
    if (equip.includes("jammer")) {
      hints.push("Jammer Arme anbauen / Höhe einstellen");
    }
    if (equip.includes("kabel")) {
      hints.push("Kabelzug / Griff vorbereiten");
    }
    if (equip.includes("langhantel") && !ex.rackSetting) {
      hints.push("Langhantel bereitstellen");
    }
    if (equip.includes("kurzhantel")) {
      hints.push("Kurzhanteln bereitlegen");
    }
    if (equip.includes("abback")) {
      hints.push("Ab & Back Trainer einstellen");
    }
    return hints[0] || "Geräte kurz checken, dann starten.";
  }

  /** Format last session as watermark: "Letztes Mal: 24 kg × 10, 10, 8" */
  function formatLastSessionBadge(last) {
    if (!last) return "";
    if (Array.isArray(last.sets) && last.sets.length) {
      const weights = last.sets.map((s) => Number(s.weight));
      const sameWeight = weights.every((w) => w === weights[0]);
      const repsPart = last.sets.map((s) => s.reps).join(", ");
      if (sameWeight) {
        return `Letztes Mal: ${weights[0]} kg × ${repsPart}`;
      }
      return `Letztes Mal: ${last.sets.map((s) => `${s.weight}×${s.reps}`).join(" · ")}`;
    }
    if (last.weight != null && last.reps != null) {
      return `Letztes Mal: ${last.weight} kg × ${last.reps}`;
    }
    return "";
  }

  function equipmentTipForExercise(ex) {
    if (!ex?.id) return null;
    return EQUIPMENT_TIPS[ex.id] || null;
  }

  function logRef(key, exId) { return ref(db, `gym/logs/${key}/${exId}`); }
  function lastWorkoutRef(key) { return ref(db, `gym/lastWorkout/${key}`); }
  function logsRootRef() { return ref(db, "gym/logs"); }

  function mergeEntryMaps(a = {}, b = {}) {
    return { ...a, ...b };
  }

  function firebaseGetWithTimeout(dbRef, ms = 2000) {
    return Promise.race([
      get(dbRef),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
    ]);
  }

  const REMOTE_WRITE_MS = 3000;

  function firebaseWriteWithTimeout(writeFn, ms = REMOTE_WRITE_MS) {
    return withTimeout(Promise.resolve().then(writeFn), ms, "write-timeout");
  }

  async function persistLogEntry(key, exId, entry) {
    await mergeLogIntoCache(key, exId, entry);

    const queueOffline = async () => {
      await enqueueWrite({ type: "log", userKey: key, exId, entry });
      return { queued: true };
    };

    if (!isOnline()) {
      return queueOffline();
    }
    try {
      await firebaseWriteWithTimeout(() => push(logRef(key, exId), entry));
      return { queued: false };
    } catch (err) {
      return queueOffline().then((r) => ({ ...r, error: err }));
    }
  }

  async function persistLastWorkout(key, data) {
    await cacheLastWorkout(key, data);

    const queueOffline = async () => {
      await enqueueWrite({ type: "lastWorkout", userKey: key, data });
      return { queued: true };
    };

    if (!isOnline()) {
      return queueOffline();
    }
    try {
      await firebaseWriteWithTimeout(() => set(lastWorkoutRef(key), data));
      return { queued: false };
    } catch (err) {
      return queueOffline().then((r) => ({ ...r, error: err }));
    }
  }

  async function flushOfflineQueue() {
    return syncPendingWrites({
      writeLog: async (userKey, exId, entry) => {
        await firebaseWriteWithTimeout(() => push(logRef(userKey, exId), entry));
      },
      writeLastWorkout: async (userKey, data) => {
        await firebaseWriteWithTimeout(() => set(lastWorkoutRef(userKey), data));
        await cacheLastWorkout(userKey, data);
      }
    });
  }

  async function saveExerciseLogWithFallback(key, exId, logEntry, { avgWeight, avgReps, setCount, silent = false }) {
    try {
      const result = await persistLogEntry(key, exId, logEntry);
      if (!silent) {
        if (result.queued) {
          showToast(`Lokal gespeichert (${setCount} Sätze).`, "info", 2200);
        } else {
          showToast(`Übung gespeichert (${setCount} Sätze, Ø ${avgWeight} kg × ${avgReps} Wdh.).`, "success", 2200);
        }
      }
      return true;
    } catch (err) {
      console.error("Speichern fehlgeschlagen (voller Eintrag):", err, logEntry);
      const { sets, ...fallbackEntry } = logEntry;
      try {
        const result = await persistLogEntry(key, exId, fallbackEntry);
        if (!silent) {
          if (result.queued) {
            showToast("Lokal gespeichert (ohne Satz-Details).", "info", 3000);
          } else {
            showToast(`Übung gespeichert (Ø ${avgWeight} kg × ${avgReps} Wdh.).`, "info", 4500);
          }
        }
        return true;
      } catch (err2) {
        console.error("Speichern fehlgeschlagen (Fallback ohne sets):", err2, fallbackEntry);
        showToast("Speichern fehlgeschlagen – Training läuft weiter, bitte später erneut versuchen.", "error", 5000);
        return false;
      }
    }
  }

  function persistExerciseCompletionInBackground({
    key,
    exId,
    logEntry,
    avgWeight,
    avgReps,
    setCount,
    progressExerciseIds,
    finalExerciseIds
  }) {
    void (async () => {
      await saveExerciseLogWithFallback(key, exId, logEntry, { avgWeight, avgReps, setCount, silent: true });
      await saveLastWorkout(key, progressExerciseIds, { silent: true });
      if (finalExerciseIds) {
        await saveLastWorkout(key, finalExerciseIds, { silent: true });
      }
      if (isOnline()) {
        await flushOfflineQueue();
      }
      void refreshLastWorkoutBox();
      refreshConnectivityBanner();
    })();
  }

  async function runWorkoutSync(panel) {
    if (!isOnline()) {
      showToast("Kein Internet — bitte WLAN oder Mobile Daten aktivieren.", "error", 3500);
      return;
    }
    panel.className = "workout-sync-card";
    panel.innerHTML = `<div class="workout-sync-title">Synchronisiere…</div><p>Dein Training wird hochgeladen.</p>`;
    const { synced, remaining } = await flushOfflineQueue();
    refreshConnectivityBanner();
    if (remaining === 0) {
      panel.className = "workout-sync-card workout-sync-card--ok";
      panel.innerHTML = synced > 0
        ? `✓ Training gespeichert (${synced} Einträge hochgeladen)`
        : "✓ Alles gespeichert";
      if (synced > 0) {
        showToast("Training erfolgreich synchronisiert.", "success", 3000);
      }
      return;
    }
    panel.className = "workout-sync-card workout-sync-card--warn";
    panel.innerHTML = `
      <div class="workout-sync-title">Sync unvollständig</div>
      <p>${synced} Einträge gespeichert, ${remaining} noch ausstehend. Bitte Internet prüfen und erneut versuchen.</p>
      <button type="button" id="workoutSyncRetryBtn" class="btn-main btn-dark">Erneut synchronisieren</button>`;
    document.getElementById("workoutSyncRetryBtn")?.addEventListener("click", () => {
      void runWorkoutSync(panel);
    });
  }

  async function initWorkoutSyncPanel() {
    const panel = document.getElementById("workoutSyncPanel");
    if (!panel) return;

    const pending = await pendingCount();

    if (pending === 0) {
      panel.className = "workout-sync-card workout-sync-card--ok";
      panel.innerHTML = "✓ Alles gespeichert";
      return;
    }

    if (!isOnline()) {
      panel.className = "workout-sync-card workout-sync-card--pending";
      panel.innerHTML = `
        <div class="workout-sync-title">Lokal gespeichert</div>
        <p>Dein Training (${pending} ${pending === 1 ? "Eintrag" : "Einträge"}) liegt auf diesem Gerät. Verbinde dich mit dem Internet, um es in der Cloud zu speichern.</p>
        <button type="button" id="workoutSyncNowBtn" class="btn-main btn-lime">Jetzt synchronisieren</button>`;
      document.getElementById("workoutSyncNowBtn")?.addEventListener("click", () => {
        void runWorkoutSync(panel);
      });
      return;
    }

    await runWorkoutSync(panel);
  }

  async function loadLogTree(key) {
    if (!key) return {};
    if (!isOnline()) {
      const cached = await readCachedLogTree(key);
      return cached || {};
    }
    try {
      const snap = await firebaseGetWithTimeout(ref(db, Paths.logs(key)));
      const val = snap.val() || {};
      cacheLogTree(key, val).catch(() => {});
      return val;
    } catch {
      const cached = await readCachedLogTree(key);
      return cached || {};
    }
  }

  /**
   * Own history: uid logs + optional legacy name logs (read-only migration).
   * Owner inspecting another key: that key only.
   */
  async function loadMergedLogTree(key, legacyName = "") {
    const primary = await loadLogTree(key);
    const { isOwner } = account();
    if (isOwner && ownerViewKey) return primary;
    const name = safeUserKey(legacyName || trainingUser);
    if (!name || name === key) return primary;
    const legacy = await loadLogTree(name);
    const out = { ...primary };
    Object.entries(legacy).forEach(([exId, entries]) => {
      out[exId] = mergeEntryMaps(out[exId], entries);
    });
    return out;
  }

  function getLastLog(key, exId) {
    return loadMergedLogTree(key, trainingUser).then((tree) => {
      const val = tree[exId];
      if (!val) return null;
      const entries = Object.values(val);
      entries.sort((a, b) => b.date - a.date);
      return entries[0] || null;
    }).catch(() => {
      showToast("Letzter Wert konnte nicht geladen werden.", "error");
      return null;
    });
  }

  async function getFullUserHistory(key) {
    const data = await loadMergedLogTree(key, trainingUser);
    const result = {};
    Object.entries(data).forEach(([exId, entries]) => {
      const list = Object.entries(entries || {})
        .map(([k, val]) => ({ ...val, _key: k }))
        .sort((a, b) => b.date - a.date);
      result[exId] = list;
    });
    return result;
  }

  async function updateLogEntry(key, exId, entryKey, updates) {
    try {
      await set(ref(db, `gym/logs/${key}/${exId}/${entryKey}`), updates);
      showToast("Eintrag aktualisiert.", "success", 2000);
      return true;
    } catch (err) {
      showToast("Aktualisierung fehlgeschlagen.", "error");
      return false;
    }
  }

  async function deleteLogEntry(key, exId, entryKey) {
    try {
      await remove(ref(db, `gym/logs/${key}/${exId}/${entryKey}`));
      showToast("Eintrag gelöscht.", "success", 2000);
      return true;
    } catch (err) {
      showToast("Löschen fehlgeschlagen.", "error");
      return false;
    }
  }

  /**
   * Owner directory: profiles + known log keys.
   * @returns {Promise<Array<{key:string,label:string}>>}
   */
  async function getAllUsers() {
    const { isOwner, uid } = account();
    if (!isOwner) {
      return uid ? [{ key: uid, label: trainingUser || "Ich" }] : [];
    }
    try {
      const [usersSnap, logsSnap, lwSnap] = await Promise.all([
        get(ref(db, "gym/users")).catch(() => null),
        get(logsRootRef()).catch(() => null),
        get(ref(db, "gym/lastWorkout")).catch(() => null)
      ]);
      const map = new Map();
      const users = usersSnap?.val() || {};
      Object.entries(users).forEach(([id, p]) => {
        map.set(id, { key: id, label: p?.displayName || id.slice(0, 8) });
      });
      Object.keys(logsSnap?.val() || {}).forEach((id) => {
        if (!map.has(id)) map.set(id, { key: id, label: id });
      });
      Object.keys(lwSnap?.val() || {}).forEach((id) => {
        if (!map.has(id)) map.set(id, { key: id, label: id });
      });
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "de"));
    } catch (err) {
      showToast("Nutzerliste konnte nicht geladen werden (Owner-Rolle in Firebase nötig?).", "error");
      return [];
    }
  }

  async function saveLastWorkout(key, exerciseIds, { silent = false } = {}) {
    const data = {
      date: Date.now(),
      duration: selectedDuration,
      body: [...selectedBody],
      level: selectedLevel,
      exerciseIds
    };
    const result = await persistLastWorkout(key, data);
    if (result.queued && !silent) {
      showToast("Offline gespeichert — sync wenn wieder online.", "info", 2800);
    }
    return result;
  }

  async function getLastWorkout(key) {
    if (!key) return null;
    if (!isOnline()) {
      return (await readCachedLastWorkout(key)) || null;
    }
    try {
      const snap = await firebaseGetWithTimeout(lastWorkoutRef(key));
      const val = snap.val();
      if (val) {
        cacheLastWorkout(key, val).catch(() => {});
        return val;
      }
      // Legacy name fallback for own account only
      const { isOwner } = account();
      if (!isOwner && trainingUser && safeUserKey(trainingUser) !== key) {
        const legacy = await firebaseGetWithTimeout(lastWorkoutRef(safeUserKey(trainingUser)));
        const legacyVal = legacy.val();
        if (legacyVal) cacheLastWorkout(key, legacyVal).catch(() => {});
        return legacyVal;
      }
      return (await readCachedLastWorkout(key)) || null;
    } catch {
      return (await readCachedLastWorkout(key)) || null;
    }
  }

  /* ================= EIGENE WORKOUT-VORLAGEN (CUSTOM WORKOUTS) ================= */

  function customWorkoutsRef(key) { return ref(db, `gym/customWorkouts/${safeUserKey(key)}`); }
  function customWorkoutRef(key, id) { return ref(db, `gym/customWorkouts/${safeUserKey(key)}/${id}`); }

  /** Ordered exercise ids while creating a custom workout. */
  let manualOrderedExerciseIds = [];

  function moveIdInList(ids, index, delta) {
    const next = index + delta;
    if (next < 0 || next >= ids.length) return ids;
    const copy = [...ids];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    return copy;
  }

  function exerciseOrderListHtml(exerciseIds, opts = {}) {
    const { dataWorkoutId = "", emptyText = "Noch keine Übungen gewählt." } = opts;
    if (!exerciseIds.length) {
      return `<div class="sub" style="margin:8px 0">${emptyText}</div>`;
    }
    return `<ol class="workout-order-list" ${dataWorkoutId ? `data-workoutid="${dataWorkoutId}"` : ""}>
      ${exerciseIds.map((id, idx) => {
        const ex = findExercise(id);
        const label = ex ? ex.name : id;
        return `<li class="workout-order-item" data-exid="${id}" data-idx="${idx}">
          <span class="workout-order-label"><span class="workout-order-num">${idx + 1}.</span> ${label}</span>
          <span class="workout-order-actions">
            <button type="button" class="workout-order-btn" data-dir="-1" title="Nach oben" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="workout-order-btn" data-dir="1" title="Nach unten" ${idx === exerciseIds.length - 1 ? "disabled" : ""}>↓</button>
          </span>
        </li>`;
      }).join("")}
    </ol>`;
  }

  async function getCustomWorkouts(key) {
    try {
      const snap = await get(customWorkoutsRef(key));
      const data = snap.val() || {};
      return Object.entries(data)
        .filter(([, w]) => !!w && Array.isArray(w.exerciseIds) && !String(w.name || "").startsWith("__MVP_"))
        .map(([id, w]) => ({ id, ...w }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } catch (err) {
      showToast("Eigene Workouts konnten nicht geladen werden.", "error");
      return [];
    }
  }

  async function saveCustomWorkout(key, name, exerciseIds) {
    try {
      const id = push(customWorkoutsRef(key)).key;
      await set(customWorkoutRef(key, id), { name, exerciseIds, createdAt: Date.now() });
      showToast(`Workout "${name}" gespeichert.`, "success");
      return id;
    } catch (err) {
      showToast("Workout konnte nicht gespeichert werden.", "error");
      return null;
    }
  }

  async function updateCustomWorkoutOrder(key, id, exerciseIds) {
    try {
      await set(ref(db, `gym/customWorkouts/${safeUserKey(key)}/${id}/exerciseIds`), exerciseIds);
      showToast("Reihenfolge gespeichert.", "success", 1800);
      return true;
    } catch (err) {
      showToast("Reihenfolge konnte nicht gespeichert werden.", "error");
      return false;
    }
  }

  async function deleteCustomWorkout(key, id) {
    try {
      await remove(customWorkoutRef(key, id));
      showToast("Workout gelöscht.", "success", 2000);
      return true;
    } catch (err) {
      showToast("Löschen fehlgeschlagen.", "error");
      return false;
    }
  }

  function renderExercisePickerList(container) {
    const selected = new Set(manualOrderedExerciseIds);
    const groups = {};
    getAllExercises().forEach(e => { (groups[e.body] = groups[e.body] || []).push(e); });
    container.innerHTML = Object.entries(groups).map(([body, list]) => `
      <div class="section-title" style="margin-top:16px; font-size:0.95em;">${BODY_LABELS[body] || body}</div>
      ${list.map(e => `
        <label class="chip" style="display:flex; align-items:center; gap:8px; width:100%; text-align:left; padding:10px 12px; margin-bottom:6px; cursor:pointer;">
          <input type="checkbox" class="manual-ex-checkbox" data-exid="${e.id}" ${selected.has(e.id) ? "checked" : ""} style="width:auto;">
          <span>${e.name}</span>
        </label>
      `).join("")}
    `).join("");
    container.querySelectorAll(".manual-ex-checkbox").forEach(cb => {
      cb.addEventListener("change", () => {
        const id = cb.dataset.exid;
        if (cb.checked) {
          if (!manualOrderedExerciseIds.includes(id)) manualOrderedExerciseIds.push(id);
        } else {
          manualOrderedExerciseIds = manualOrderedExerciseIds.filter((x) => x !== id);
        }
        renderManualOrderPreview();
      });
    });
  }

  function renderManualOrderPreview() {
    const box = document.getElementById("manualWorkoutOrder");
    if (!box) return;
    box.innerHTML = `
      <div class="field-label" style="margin-top:14px">Reihenfolge</div>
      <div class="sub" style="margin-bottom:6px">Mit ↑↓ die Trainingsreihenfolge festlegen.</div>
      ${exerciseOrderListHtml(manualOrderedExerciseIds)}
    `;
    box.querySelectorAll(".workout-order-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".workout-order-item");
        const idx = parseInt(item?.dataset.idx, 10);
        const dir = parseInt(btn.dataset.dir, 10);
        if (Number.isNaN(idx) || Number.isNaN(dir)) return;
        manualOrderedExerciseIds = moveIdInList(manualOrderedExerciseIds, idx, dir);
        renderManualOrderPreview();
      });
    });
  }

  async function renderCustomWorkoutsSection() {
    const wrap = document.getElementById("customWorkoutsSection");
    if (!wrap) return;
    const key = readKey();
    if (!key) {
      wrap.innerHTML = "";
      return;
    }
    const saved = await getCustomWorkouts(key);
    const mesoActive = !!getActiveMesocycle(key) || mesoOptIn;
    wrap.innerHTML = `
      ${mesoActive && saved.length ? `<div class="setup-saved-hint">Mesozyklus aktiv — gespeicherte Workouts nutzen Phasen-Soll (Sätze, RIR).</div>` : ""}
      ${saved.length ? `<div class="setup-saved-list">${saved.map((w) => `
        <div class="setup-saved-card" data-workoutid="${w.id}">
          <div class="setup-saved-row">
            <div class="setup-saved-meta">
              <strong>${w.name}</strong>
              <span class="sub">${(w.exerciseIds || []).length} Üb.</span>
            </div>
            <div class="setup-saved-actions">
              <button class="btn-main btn-compact btn-lime start-custom-workout-btn" data-workoutid="${w.id}">Start</button>
              <button class="btn-main btn-compact btn-dark edit-custom-workout-btn" data-workoutid="${w.id}">Bearb.</button>
            </div>
          </div>
          <div class="custom-workout-edit-panel" id="editPanel-${w.id}" style="display:none">
            <div class="sub" style="margin-bottom:6px">Reihenfolge mit ↑↓ anpassen — wird sofort gespeichert.</div>
            ${exerciseOrderListHtml(w.exerciseIds || [], { dataWorkoutId: w.id })}
            <button class="btn-main btn-compact btn-dark delete-custom-workout-btn" data-workoutid="${w.id}" style="margin-top:8px;width:100%">Löschen</button>
          </div>
        </div>
      `).join("")}</div>` : `<div class="setup-block-hint">Noch keine eigenen Workouts — unter Profil &amp; mehr anlegen.</div>`}
    `;
    wrap.querySelectorAll(".edit-custom-workout-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const panel = document.getElementById(`editPanel-${btn.dataset.workoutid}`);
        if (!panel) return;
        const isOpen = panel.style.display !== "none";
        panel.style.display = isOpen ? "none" : "";
        btn.textContent = isOpen ? "Bearb." : "Fertig";
      });
    });
    wrap.querySelectorAll(".workout-order-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const list = btn.closest(".workout-order-list");
        const item = btn.closest(".workout-order-item");
        const workoutId = list?.dataset.workoutid;
        const idx = parseInt(item?.dataset.idx, 10);
        const dir = parseInt(btn.dataset.dir, 10);
        const w = saved.find((x) => x.id === workoutId);
        if (!w || Number.isNaN(idx) || Number.isNaN(dir)) return;
        const nextIds = moveIdInList(w.exerciseIds || [], idx, dir);
        const ok = await updateCustomWorkoutOrder(key, workoutId, nextIds);
        if (!ok) return;
        w.exerciseIds = nextIds;
        await renderCustomWorkoutsSection();
        const panel = document.getElementById(`editPanel-${workoutId}`);
        if (panel) panel.style.display = "";
        const toggleBtn = document.querySelector(`.edit-custom-workout-btn[data-workoutid="${workoutId}"]`);
        if (toggleBtn) toggleBtn.textContent = "Fertig";
      });
    });
    wrap.querySelectorAll(".start-custom-workout-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const w = saved.find(x => x.id === btn.dataset.workoutid);
        if (!w) return;
        await prepareSessionOverrides();
        currentWorkoutQueue = startCustomWorkoutWithOptionalMeso(w.exerciseIds || []);
        if (!currentWorkoutQueue || currentWorkoutQueue.length === 0) {
          alert("Übungen aus diesem Workout nicht mehr verfügbar.");
          return;
        }
        currentExerciseIdx = 0;
        completedBodies = new Set();
        currentSets = [];
        pendingRestoredSets = null;
        sessionVolumeKg = 0;
        sessionSetCount = 0;
        sessionPhase = "warmup";
        saveActiveSession();
        if (activeMesoRx) {
          showToast(`Mesozyklus · ${activeMesoRx.label}: ${activeMesoRx.targetSetsPerExercise} Sätze, RIR ${activeMesoRx.targetRirMin}–${activeMesoRx.targetRirMax}`, "info", 2800);
        }
        renderWarmup();
      });
    });
    wrap.querySelectorAll(".delete-custom-workout-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Dieses Workout wirklich löschen?")) return;
        await deleteCustomWorkout(key, btn.dataset.workoutid);
        renderCustomWorkoutsSection();
      });
    });
  }

  function renderManualWorkoutBuilder() {
    const builder = document.getElementById("manualWorkoutBuilder");
    if (!builder) return;
    const key = writeKey();
    const nameValue = document.getElementById("manualWorkoutNameInput")?.value || "";
    builder.innerHTML = `
      <div class="section-title" style="margin-top:20px">Übungen auswählen</div>
      <div id="manualExercisePickerList"></div>
      <div id="manualWorkoutOrder"></div>
      <input id="manualWorkoutNameInput" class="name-input" style="margin-top:16px" placeholder="Workout-Name, z. B. Leg Day A" maxlength="30" value="${nameValue.replace(/"/g, "&quot;")}">
      <div style="display:flex; gap:10px; margin-top:14px;">
        <button id="saveManualWorkoutBtn" class="btn-main btn-lime" style="flex:1;">💾 Speichern</button>
        <button id="cancelManualWorkoutBtn" class="btn-main btn-dark" style="flex:1;">Abbrechen</button>
      </div>
    `;
    renderExercisePickerList(document.getElementById("manualExercisePickerList"));
    renderManualOrderPreview();
    document.getElementById("saveManualWorkoutBtn").addEventListener("click", async () => {
      const name = document.getElementById("manualWorkoutNameInput").value.trim();
      if (!name) { alert("Bitte einen Namen für das Workout eingeben."); return; }
      if (manualOrderedExerciseIds.length === 0) { alert("Bitte mindestens eine Übung auswählen."); return; }
      if (!key) { alert("Bitte zuerst anmelden."); return; }
      await saveCustomWorkout(key, name, [...manualOrderedExerciseIds]);
      manualOrderedExerciseIds = [];
      renderCustomWorkoutsSection();
    });
    document.getElementById("cancelManualWorkoutBtn").addEventListener("click", () => {
      manualOrderedExerciseIds = [];
      builder.innerHTML = "";
    });
  }

  /* ================= GEWICHTSEMPFEHLUNG MIT RIR (Reps in Reserve) ================= */

  function calculateNextWeight(lastSession) {
    // lastSession = { weight, reps, rir, targetRepsMax }
    const step = (lastSession.weight >= 20) ? 2.5 : 2;
    let nextWeight = lastSession.weight;
    let message = "";

    if (lastSession.rir == null) {
      message = `Letztes Mal ${lastSession.weight} kg × ${lastSession.reps} Wdh. (keine RIR-Angabe) → gleiches Gewicht, versuche 1 Wdh. mehr.`;
    } else if (lastSession.rir >= 3) {
      nextWeight += step;
      message = `Letztes Mal war sehr leicht (RIR ${lastSession.rir}). Steigere um ${step} kg!`;
    } else if (lastSession.rir >= 1 && lastSession.reps >= lastSession.targetRepsMax) {
      nextWeight += step;
      message = `Ziel-Wdh. mit gutem RIR (${lastSession.rir}) erreicht! Zeit für mehr Gewicht.`;
    } else if (lastSession.rir >= 1) {
      message = `Bleib bei ${nextWeight} kg (RIR ${lastSession.rir}) und versuche 1 Wdh. mehr.`;
    } else if (lastSession.rir === 0 && lastSession.reps < lastSession.targetRepsMax) {
      nextWeight = Math.max(0, nextWeight - step);
      message = "Letztes Mal war sehr schwer (Muskelversagen). Ein kleines Stück runtergehen.";
    } else {
      message = `Bleib bei ${nextWeight} kg und versuche 1 Wdh. mehr.`;
    }

    // Meso deload / phase load steering
    if (activeMesoRx?.loadMult && activeMesoRx.loadMult < 1) {
      const phased = applyPhaseLoad(lastSession.weight, activeMesoRx);
      nextWeight = phased;
      message = `Deload: ~${Math.round(activeMesoRx.loadMult * 100)} % der letzten Last → ${phased} kg, RIR ${activeMesoRx.targetRirMin}–${activeMesoRx.targetRirMax}.`;
    }

    return { nextWeight, message };
  }

  function computeRecommendation(last, ex) {
    const minReps = (last && last.minReps) || ex.defMin;
    const maxReps = (last && last.maxReps) || ex.defMax;
    if (!last || !last.weight) {
      return { weight: null, reps: minReps, minReps, maxReps, note: "Starte konservativ – wähle ein Gewicht, das du sauber " + minReps + "× schaffst." };
    }
    const { nextWeight, message } = calculateNextWeight({
      weight: last.weight,
      reps: last.reps,
      rir: (last.rir != null) ? last.rir : null,
      targetRepsMax: maxReps
    });
    const suggestedReps = (last.rir != null && last.rir === 0 && last.reps < maxReps) ? minReps : Math.min(last.reps + 1, maxReps);
    return { weight: nextWeight, reps: suggestedReps, minReps, maxReps, note: message };
  }

  /* ================= TRAINING TAB RENDERING ================= */

  function aiSetupSummaryLine() {
    const bodyStr = selectedBody.size
      ? [...selectedBody].map((b) => BODY_LABELS[b] || b).join(", ")
      : "Bereich wählen";
    const levelStr = selectedLevel ? LEVEL_LABELS[selectedLevel] : "Level wählen";
    const goalStr = selectedGoal ? GOAL_LABELS[selectedGoal] : "Ziel wählen";
    const cardioStr = cardioEnabled === true ? " · Cardio" : cardioEnabled === false ? "" : " · Cardio?";
    return `${selectedDuration} min · ${bodyStr} · ${levelStr} · ${goalStr}${cardioStr}`;
  }

  function updateAiSetupSummary() {
    const el = document.getElementById("aiSetupSummary");
    if (el) el.textContent = aiSetupSummaryLine();
  }

  function renderMesoSetupPanelInnerHtml() {
    const existing = getActiveMesocycle(writeKey());
    if (existing) {
      const rx = getSessionPrescription(existing);
      return `
        <div class="meso-status-card">
          <div class="meso-banner-title">${rx.statusLine}</div>
          <div class="sub" style="margin-top:4px">Fokus: ${mesoFocusLabel(existing.focus, BODY_LABELS)} · ${existing.frequency}× / Woche${existing.volumeBonus ? ` · Volumen-Bonus +${existing.volumeBonus}` : ""}</div>
          <div class="sub" style="margin-top:4px">Heute: ${(rx.bodies || []).map((b) => BODY_LABELS[b] || b).join(", ")}</div>
          ${renderAdviceHtml(rx.advice)}
          ${renderVolumeBarsHtml(rx.volumeReport)}
          <button type="button" id="mesoEndBtn" class="owner-link" style="margin-top:8px">Mesozyklus beenden</button>
        </div>`;
    }
    const completed = getCompletedMesocycle(writeKey());
    return `
      ${completed ? `
        <div class="meso-status-card" style="margin-bottom:10px">
          <div class="meso-banner-title">Letzter Mesozyklus abgeschlossen</div>
          <div class="sub" style="margin-top:4px">Neuer Start übernimmt Frequenz/Fokus und erhöht das Wochenvolumen leicht.</div>
          <button type="button" id="mesoStartNextFromSetupBtn" class="btn-main btn-meso" style="margin-top:8px">Neuen Mesozyklus anlegen →</button>
        </div>` : ""}
      <div class="field-label" style="margin-top:4px">Trainingstage / Woche</div>
      <div class="chip-row" id="mesoFreqChips">
        ${MESO_FREQUENCIES.map((n) => `<button type="button" class="chip${mesoFrequency === n ? " active" : ""}" data-freq="${n}">${n}×</button>`).join("")}
      </div>
      <div class="field-label" style="margin-top:12px">Fokus</div>
      <div class="chip-row" id="mesoFocusChips">
        <button type="button" class="chip${mesoFocus === MESO_FOCUS_BALANCED ? " active" : ""}" data-focus="${MESO_FOCUS_BALANCED}">Ausgeglichen</button>
        ${Object.entries(BODY_LABELS).map(([k, l]) => `<button type="button" class="chip${mesoFocus === k ? " active" : ""}" data-focus="${k}">${l}</button>`).join("")}
      </div>
      ${selectedLevel && selectedLevel !== "advanced"
        ? `<div class="sub" style="margin-top:8px;color:#f5c542">Hinweis: Mesozyklus ist für Fortgeschrittene gedacht — Level „Fortgeschritten“ empfohlen.</div>`
        : `<div class="sub" style="margin-top:8px">Eigener Trainingsplan mit Phasen-Soll (Sätze, RIR, Deload). Unabhängig vom AI Workout.</div>`}
    `;
  }

  function renderMesoBlockSummaryHtml() {
    const existing = getActiveMesocycle(writeKey());
    if (existing) {
      const rx = getSessionPrescription(existing);
      return `<div class="setup-block-hint">${rx.statusLine}</div>`;
    }
    if (mesoOptIn) {
      return `<div class="setup-block-hint">Mesozyklus bereit — ${mesoFrequency}× pro Woche. Einstellungen unten anpassen.</div>`;
    }
    return "";
  }

  async function validateAndStartWorkout({ useMeso }) {
    if (!writeKey()) { alert("Bitte zuerst anmelden."); return false; }
    if (!trainingUser) { alert("Bitte Anzeigenamen unter Profil & mehr setzen."); return false; }
    if (!selectedLevel) { alert("Bitte ein Erfahrungslevel wählen."); return false; }

    if (useMeso) {
      if (!mesoOptIn || !getActiveMesocycle(writeKey())) {
        alert("Bitte zuerst einen Mesozyklus starten.");
        return false;
      }
      if (selectedLevel === "easy") {
        if (!confirm("Mesozyklus ist für Fortgeschrittene gedacht. Trotzdem starten?")) return false;
      }
    } else {
      if (selectedBody.size === 0) {
        alert("Bitte mindestens einen Trainingsbereich wählen.");
        return false;
      }
      if (!selectedGoal) { alert("Bitte ein Trainingsziel wählen."); return false; }
      if (cardioEnabled === null) { alert("Bitte wählen: Cardio dazu — Ja oder Nein."); return false; }
      if (cardioEnabled === true && selectedCardio.size === 0) {
        alert("Bitte mindestens eine Cardio-Möglichkeit wählen.");
        return false;
      }
    }
    saveSetupPrefs();
    await prepareSessionOverrides();
    if (useMeso) {
      currentWorkoutQueue = buildMesocycleSession();
      sessionMesoSetsByBody = {};
    } else {
      activeMesoRx = null;
      sessionMesoSetsByBody = {};
      currentWorkoutQueue = buildWorkout();
    }
    currentExerciseIdx = 0;
    completedBodies = new Set();
    currentSets = [];
    pendingRestoredSets = null;
    sessionVolumeKg = 0;
    sessionSetCount = 0;
    sessionPhase = "warmup";
    saveActiveSession();
    renderWarmup();
    return true;
  }

  function renderSetupBackBtnHtml() {
    return `<button type="button" id="backToTrainingBtn" class="setup-back-btn">← Zurück</button>`;
  }

  function renderAiSetupFieldsHtml() {
    return `
      <div class="section-title" style="margin-top:4px">Dauer</div>
      <div class="dur-row" id="trainDurRow">
        ${[15, 30, 45, 60].map((m) => `<button class="btn-dur${m === selectedDuration ? " active" : ""}" data-min="${m}">${m} min</button>`).join("")}
      </div>
      <div class="section-title" style="margin-top:16px">Trainingsbereich</div>
      <div class="chip-row" id="bodyChips">
        ${Object.entries(BODY_LABELS).map(([k, l]) => `<button class="chip${selectedBody.has(k) ? " active" : ""}" data-body="${k}">${l}</button>`).join("")}
      </div>
      <div class="section-title" style="margin-top:16px">Erfahrungslevel</div>
      <div class="chip-row" id="levelChips">
        ${LEVEL_ORDER.map((k) => `<button class="chip level-chip${selectedLevel === k ? " active" : ""}" data-level="${k}">${LEVEL_LABELS[k]}</button>`).join("")}
      </div>
      <div class="section-title" style="margin-top:16px">Trainingsziel</div>
      <div class="chip-row" id="goalChips">
        ${GOAL_ORDER.map((k) => `<button type="button" class="chip goal-chip${selectedGoal === k ? " active" : ""}" data-goal="${k}">${GOAL_LABELS[k]}</button>`).join("")}
      </div>
      <div class="section-title" style="margin-top:16px">Cardio dazu?</div>
      <div class="chip-row" id="cardioYesNoRow">
        <button type="button" class="chip${cardioEnabled === true ? " active" : ""}" data-cardio="yes">Ja</button>
        <button type="button" class="chip${cardioEnabled === false ? " active" : ""}" data-cardio="no">Nein</button>
      </div>
      <div id="cardioOptionsWrap" style="${cardioEnabled === true ? "" : "display:none"}">
        <div class="sub" style="margin:8px 0 6px">Welche Möglichkeiten? (Mehrfachauswahl)</div>
        <div class="chip-row" id="cardioModChips">
          ${CARDIO_OPTIONS.map((c) => `<button type="button" class="chip${selectedCardio.has(c.id) ? " active" : ""}" data-cardioid="${c.id}">${c.label}</button>`).join("")}
        </div>
      </div>`;
  }

  function bindAiSetupFields({ onChange } = {}) {
    const notify = () => {
      saveSetupPrefs();
      onChange?.();
    };
    document.querySelectorAll("#trainDurRow .btn-dur").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#trainDurRow .btn-dur").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedDuration = parseInt(btn.dataset.min, 10);
        notify();
      });
    });
    document.querySelectorAll("#bodyChips .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.body;
        if (selectedBody.has(k)) { selectedBody.delete(k); btn.classList.remove("active"); }
        else { selectedBody.add(k); btn.classList.add("active"); }
        notify();
      });
    });
    document.querySelectorAll("#levelChips .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedLevel = btn.dataset.level;
        document.querySelectorAll("#levelChips .chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        notify();
      });
    });
    document.querySelectorAll("#goalChips .goal-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedGoal = btn.dataset.goal;
        document.querySelectorAll("#goalChips .goal-chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        notify();
      });
    });
    document.querySelectorAll("#cardioYesNoRow .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        cardioEnabled = btn.dataset.cardio === "yes";
        document.querySelectorAll("#cardioYesNoRow .chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const wrap = document.getElementById("cardioOptionsWrap");
        if (wrap) wrap.style.display = cardioEnabled ? "" : "none";
        if (!cardioEnabled) selectedCardio = new Set();
        notify();
      });
    });
    document.querySelectorAll("#cardioModChips .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.cardioid;
        if (selectedCardio.has(id)) {
          selectedCardio.delete(id);
          btn.classList.remove("active");
        } else {
          selectedCardio.add(id);
          btn.classList.add("active");
        }
        notify();
      });
    });
  }

  function bindMesoSetupFields() {
    document.querySelectorAll("#mesoFreqChips .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        mesoFrequency = parseInt(btn.dataset.freq, 10);
        document.querySelectorAll("#mesoFreqChips .chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        saveSetupPrefs();
      });
    });
    document.querySelectorAll("#mesoFocusChips .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        mesoFocus = btn.dataset.focus || MESO_FOCUS_BALANCED;
        document.querySelectorAll("#mesoFocusChips .chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        saveSetupPrefs();
      });
    });
    document.getElementById("mesoEndBtn")?.addEventListener("click", () => {
      const uid = writeKey();
      if (!uid) return;
      if (!confirm("Aktiven Mesozyklus beenden?")) return;
      clearMesocycle(uid);
      mesoOptIn = false;
      activeMesoRx = null;
      sessionMesoSetsByBody = {};
      showToast("Mesozyklus beendet.", "info", 2000);
      renderMesoSetupPage();
    });
    document.getElementById("mesoStartNextFromSetupBtn")?.addEventListener("click", () => {
      const uid = writeKey();
      if (!uid) return;
      const prev = getCompletedMesocycle(uid);
      startNextMesocycle(uid, prev || { frequency: mesoFrequency, focus: mesoFocus });
      mesoOptIn = true;
      saveSetupPrefs();
      showToast("Neuer Mesozyklus angelegt (+Volumen).", "success", 2500);
      renderMesoSetupPage();
    });
  }

  function activateMesocycleFromSetup() {
    if (!writeKey()) { alert("Bitte zuerst anmelden."); return false; }
    if (!trainingUser) { alert("Bitte Anzeigenamen unter Profil setzen."); return false; }
    if (selectedLevel === "easy") {
      if (!confirm("Mesozyklus ist für Fortgeschrittene gedacht. Trotzdem starten?")) return false;
    }
    const uid = writeKey();
    const existing = getActiveMesocycle(uid);
    if (!existing) {
      saveMesocycle(uid, createMesocycle({ frequency: mesoFrequency, focus: mesoFocus }));
    }
    mesoOptIn = true;
    saveSetupPrefs();
    showToast("Mesozyklus gestartet.", "success", 2200);
    return true;
  }

  function renderAiWorkoutSetupPage() {
    hideWorkoutProgress();
    const wrap = document.getElementById("trainingContent");
    if (!wrap) return;
    const prefs = loadSetupPrefs();
    if (prefs) applySetupPrefs(prefs);

    wrap.innerHTML = `
      ${renderSetupBackBtnHtml()}
      <div class="setup-subpage-head">
        <div class="setup-subpage-title">AI Workout generieren</div>
        <div class="setup-subpage-sub">Dauer, Bereich, Level, Ziel und Cardio wählen</div>
      </div>
      ${!trainingUser ? `<div class="info-box setup-block-notice">Anzeigename fehlt — bitte unter <strong>Profil &amp; mehr</strong> setzen.</div>` : ""}
      <div class="setup-summary" id="aiSetupSummary">${aiSetupSummaryLine()}</div>
      ${renderAiSetupFieldsHtml()}
      <button id="confirmAiWorkoutBtn" class="btn-main btn-lime setup-block-cta" style="margin-top:20px">Workout generieren &amp; starten →</button>
    `;

    document.getElementById("backToTrainingBtn")?.addEventListener("click", renderTrainingSetup);
    bindAiSetupFields({
      onChange: () => {
        updateAiSetupSummary();
      }
    });
    document.getElementById("confirmAiWorkoutBtn")?.addEventListener("click", () => validateAndStartWorkout({ useMeso: false }));
  }

  function renderMesoSetupPage() {
    hideWorkoutProgress();
    const wrap = document.getElementById("trainingContent");
    if (!wrap) return;
    const uid = writeKey();
    const activeMeso = uid ? getActiveMesocycle(uid) : null;
    if (activeMeso) mesoOptIn = true;

    wrap.innerHTML = `
      ${renderSetupBackBtnHtml()}
      <div class="setup-subpage-head">
        <div class="setup-subpage-title">Mesozyklus</div>
        <div class="setup-subpage-sub">Strukturierter Hypertrophie-Plan · 5 Wochen Aufbau → Peak → Deload</div>
      </div>
      ${!trainingUser ? `<div class="info-box setup-block-notice">Anzeigename fehlt — bitte unter <strong>Profil &amp; mehr</strong> setzen.</div>` : ""}
      <div id="mesoSetupPanel" style="margin-top:8px">
        ${renderMesoSetupPanelInnerHtml()}
      </div>
      ${activeMeso
        ? `<div class="setup-block-hint" style="margin-top:14px">Mesozyklus ist aktiv. Gespeicherte Workouts und Schnellstart nutzen automatisch Phasen-Soll (Sätze, RIR).</div>`
        : `<button id="activateMesoBtn" class="btn-main btn-meso setup-block-cta" style="margin-top:20px">Mesozyklus starten →</button>`}
    `;

    document.getElementById("backToTrainingBtn")?.addEventListener("click", renderTrainingSetup);
    bindMesoSetupFields();
    document.getElementById("activateMesoBtn")?.addEventListener("click", () => {
      if (activateMesocycleFromSetup()) renderTrainingSetup();
    });
  }

  async function renderProfileSetupPage() {
    hideWorkoutProgress();
    syncTrainingUser();
    const wrap = document.getElementById("trainingContent");
    if (!wrap) return;
    const { email, isOwner, uid } = account();

    let ownerChipsHTML = "";
    if (isOwner) {
      const allUsers = await getAllUsers();
      ownerChipsHTML = `
        <div class="section-title">Owner: Profil wählen</div>
        <div class="chip-row" style="margin-bottom:10px">
          ${allUsers.map((u) => `<button type="button" class="chip profile-chip${u.key === ownerViewKey ? " active" : ""}" data-key="${u.key}">${u.label}</button>`).join("")}
        </div>`;
    }

    wrap.innerHTML = `
      ${renderSetupBackBtnHtml()}
      <div class="setup-subpage-head">
        <div class="setup-subpage-title">Profil &amp; mehr</div>
        <div class="setup-subpage-sub">Anzeigename, Workouts anlegen, Verlauf</div>
      </div>
      ${ownerChipsHTML}
      <div class="info-box" style="margin-top:8px;margin-bottom:12px">
        Angemeldet als <strong>${email || "Konto"}</strong><br>
        Anzeigename: <strong>${trainingUser || "— noch nicht gesetzt —"}</strong>
      </div>
      <input id="userNameInput" class="name-input" placeholder="Dein Anzeigename" maxlength="40" value="${trainingUser || ""}">
      <div class="sub" style="margin:8px 0 10px">Name wird in deinem Profil gespeichert.</div>
      <div class="section-title" style="margin-top:20px">Eigenes Workout erstellen</div>
      <button id="createManualWorkoutBtn" class="btn-main btn-dark" style="width:100%">Neues Workout erstellen</button>
      <div id="manualWorkoutBuilder"></div>
      <div class="section-title" style="margin-top:20px">Verlauf</div>
      <div id="lastWorkoutBox"></div>
      <div style="text-align:center;margin-top:10px"><button id="viewHistoryBtn" class="owner-link">📊 Bisherige Übungen ansehen</button></div>
    `;

    document.getElementById("backToTrainingBtn")?.addEventListener("click", renderTrainingSetup);
    document.getElementById("userNameInput")?.addEventListener("input", (e) => {
      updateTrainingUser(e.target.value.trim());
      refreshLastWorkoutBox();
      renderCustomWorkoutsSection();
    });
    document.getElementById("createManualWorkoutBtn")?.addEventListener("click", () => {
      manualOrderedExerciseIds = [];
      renderManualWorkoutBuilder();
    });
    document.getElementById("viewHistoryBtn")?.addEventListener("click", () => {
      const key = readKey();
      if (!key) { alert("Kein Profil geladen."); return; }
      renderUserHistory(key);
    });
    if (isOwner) {
      document.querySelectorAll(".profile-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          ownerViewKey = btn.dataset.key;
          renderProfileSetupPage();
        });
      });
    }
    refreshLastWorkoutBox();
  }

  async function renderTrainingSetup() {
    syncTrainingUser();
    hideWorkoutProgress();
    const wrap = document.getElementById("trainingContent");
    const { isPermanent, email, isOwner, uid } = account();

    if (!isPermanent || !uid) {
      ownerViewKey = null;
      wrap.innerHTML = requireLoginHtml();
      document.getElementById("trainingGoLoginBtn")?.addEventListener("click", () => {
        ctx.onGoToLogin?.();
      });
      return;
    }

    // Non-owner always works on own uid
    if (!isOwner) ownerViewKey = null;
    if (isOwner && !ownerViewKey) ownerViewKey = uid;

    await loadCustomExercises();
    const activeKey = readKey();
    const viewingOther = isOwner && ownerViewKey && ownerViewKey !== uid;
    if (!viewingOther && getActiveMesocycle(uid)) {
      mesoOptIn = true;
    }
    const mesoActive = !!getActiveMesocycle(uid) || mesoOptIn;
    const prefs = loadSetupPrefs();
    if (prefs) applySetupPrefs(prefs);

    wrap.innerHTML = `
      ${!viewingOther ? `
      <div class="setup-block-card setup-block--quick">
        <div class="setup-block-head">
          <span class="setup-block-num">1</span>
          <div>
            <div class="setup-block-title">Schnellstart</div>
            <div class="setup-block-sub">Gespeicherte Workouts · letzte Einstellungen</div>
          </div>
        </div>
        ${hasActiveSession()
          ? `<div class="info-box resume-session-card" style="margin-bottom:12px">
              <strong>Offenes Training gefunden</strong>
              <div class="sub" style="margin-top:6px">Weitermachen, wo du aufgehört hast.</div>
              <button id="resumeTrainingBtn" class="btn-session-primary" style="margin-top:10px;width:100%">Training fortsetzen →</button>
              <button id="discardTrainingBtn" class="btn-session-secondary" style="margin-top:8px;width:100%">Verwerfen &amp; neu starten</button>
            </div>`
          : ""}
        ${(() => {
          if (!prefs || !prefs.level) return "";
          const bodyStr = (prefs.body || []).map((b) => BODY_LABELS[b] || b).join(", ") || "Alle";
          const goalStr = GOAL_LABELS[prefs.goal] || prefs.goal || "";
          return `<button id="quickStartBtn" class="btn-session-primary" style="width:100%;margin-bottom:12px">Wie zuletzt: ${prefs.duration} min · ${bodyStr} · ${goalStr}</button>`;
        })()}
        <div id="customWorkoutsSection"></div>
      </div>

      <div class="setup-block-card setup-block--ai">
        <div class="setup-block-head">
          <span class="setup-block-num">2</span>
          <div>
            <div class="setup-block-title">AI Workout</div>
            <div class="setup-block-sub">Automatisch generiert · getrennt vom Mesozyklus</div>
          </div>
        </div>
        <button id="openAiWorkoutBtn" class="btn-main btn-lime setup-block-cta">AI Workout generieren →</button>
      </div>

      <div class="setup-path-divider" aria-hidden="true"><span>Eigenes Trainingsprogramm</span></div>

      <div class="setup-block-card setup-block--meso">
        <div class="setup-block-head setup-block-head--meso">
          <div>
            <div class="setup-block-title">Mesozyklus</div>
            <div class="setup-block-sub">Hypertrophie-Plan aktivieren oder beenden</div>
          </div>
        </div>
        ${mesoActive ? renderMesoBlockSummaryHtml() : `<div class="setup-block-hint">Noch kein Mesozyklus aktiv.</div>`}
        <button id="openMesoSetupBtn" class="btn-main btn-meso setup-block-cta">${mesoActive ? "Mesozyklus verwalten →" : "Mesozyklus starten →"}</button>
      </div>

      <button type="button" id="openProfileSetupBtn" class="setup-advanced-toggle">Profil &amp; mehr →</button>
      ` : `
      <div class="section-title">${viewingOther ? "Ansicht fremdes Profil" : "Profil"}</div>
      <div class="info-box" style="margin-bottom:12px">
        Angemeldet als <strong>${email || "Konto"}</strong><br>
        Anzeigename: <strong>${trainingUser || "—"}</strong>
        ${viewingOther ? `<br><span style="color:#f5c542">Owner schaut Daten von Key <code>${ownerViewKey}</code> an.</span>` : ""}
      </div>
      <div id="lastWorkoutBox"></div>
      <div style="text-align:center;margin-top:10px"><button id="viewHistoryBtn" class="owner-link">📊 Bisherige Übungen ansehen</button></div>
      <div class="info-box" style="margin-top:16px">Im Owner-Fremdprofil kannst du Historie einsehen/löschen, aber kein Workout für andere starten.</div>`}
    `;

    document.getElementById("openAiWorkoutBtn")?.addEventListener("click", renderAiWorkoutSetupPage);
    document.getElementById("openMesoSetupBtn")?.addEventListener("click", renderMesoSetupPage);
    document.getElementById("openProfileSetupBtn")?.addEventListener("click", renderProfileSetupPage);
    document.getElementById("resumeTrainingBtn")?.addEventListener("click", async () => {
      if (!resumeActiveTraining()) {
        showToast("Kein gespeichertes Training gefunden.", "error", 2500);
        return;
      }
      showToast("Training fortgesetzt.", "success", 1800);
    });
    document.getElementById("discardTrainingBtn")?.addEventListener("click", () => {
      if (!confirm("Offenes Training wirklich verwerfen?")) return;
      abandonActiveTraining();
      showToast("Altes Training verworfen.", "info", 1800);
      renderTrainingSetup();
    });
    document.getElementById("quickStartBtn")?.addEventListener("click", async () => {
      const savedPrefs = loadSetupPrefs();
      if (!savedPrefs) return;
      applySetupPrefs(savedPrefs);
      if (mesoOptIn && getActiveMesocycle(writeKey())) {
        await validateAndStartWorkout({ useMeso: true });
      } else {
        await validateAndStartWorkout({ useMeso: false });
      }
    });
    document.getElementById("viewHistoryBtn")?.addEventListener("click", () => {
      const key = readKey();
      if (!key) { alert("Kein Profil geladen."); return; }
      renderUserHistory(key);
    });
    if (!viewingOther) renderCustomWorkoutsSection();
  }

  async function refreshLastWorkoutBox() {
    const box = document.getElementById("lastWorkoutBox");
    if (!box) return;
    const key = readKey();
    if (!key) { box.innerHTML = ""; return; }
    const lw = await getLastWorkout(key);
    if (!lw) { box.innerHTML = ""; return; }
    const dateStr = new Date(lw.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
    const canRepeat = writeKey() && readKey() === writeKey();
    box.innerHTML = `<div class="info-box" style="margin-top:12px">Letztes Workout (${dateStr}, ${lw.duration} Min, ${(lw.exerciseIds || []).length} Übungen).
      ${canRepeat ? `<button id="repeatWorkoutBtn" class="btn-main btn-dark" style="margin-top:10px">🔁 Gleiches Workout wiederholen</button>` : ""}</div>`;
    document.getElementById("repeatWorkoutBtn")?.addEventListener("click", () => {
      currentWorkoutQueue = (lw.exerciseIds || []).map((id) => findExercise(id)).filter(Boolean);
      if (currentWorkoutQueue.length === 0) { alert("Übungen aus diesem Workout nicht mehr verfügbar."); return; }
      currentExerciseIdx = 0;
      renderTrainingExercise();
    });
  }


  async function renderDbOverview() {
    const box = document.getElementById("dbOverviewBox");
    if (!box) return;
    const users = await getAllUsers();
    if (users.length === 0) {
      box.innerHTML = "Noch keine Profile/Trainingsdaten sichtbar. (Owner-Rolle in Firebase unter gym/roles setzen, damit alle Keys lesbar sind.)";
      return;
    }

    let html = `<div style="text-align:left">`;
    for (const u of users) {
      const history = await getFullUserHistory(u.key);
      const exCount = Object.keys(history).length;
      let entryCount = 0;
      Object.values(history).forEach((entries) => { entryCount += entries.length; });
      html += `<div class="db-user-row">
        <div><strong style="color:#cdf94a">${u.label}</strong> <span style="color:#666;font-size:11px">${u.key.slice(0, 10)}…</span> — ${exCount} Übungen, ${entryCount} Einträge</div>
        <div style="margin-top:6px">
          <button class="btn-main btn-dark db-view-btn" data-key="${u.key}" style="width:auto;padding:8px 14px;font-size:12px;display:inline-block;margin-right:8px">Details ansehen</button>
          <button class="btn-main db-del-user-btn" data-key="${u.key}" data-label="${u.label}" style="width:auto;padding:8px 14px;font-size:12px;display:inline-block;background:#3a1414;color:#ff8a8a;border:1px solid #5a1f1f">Alle Daten löschen</button>
        </div>
        <div class="db-detail" id="dbDetail-${u.key}" style="display:none;margin-top:10px"></div>
      </div>`;
    }
    html += `</div>`;
    box.innerHTML = html;

    document.querySelectorAll(".db-view-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.key;
        const detailDiv = document.getElementById(`dbDetail-${key}`);
        if (detailDiv.style.display === "block") { detailDiv.style.display = "none"; return; }
        const history = await getFullUserHistory(key);
        let detailHTML = "";
        Object.entries(history).forEach(([exId, entries]) => {
          const exName = entries[0]?.exerciseName || exId;
          detailHTML += `<div style="margin-top:8px;padding:8px;background:#0d0d0d;border-radius:8px">
            <div style="color:#ddd;font-size:13px;margin-bottom:4px">${exName}</div>`;
          entries.slice(0, 5).forEach((e) => {
            const d = new Date(e.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
            detailHTML += `<div style="font-size:12px;color:#888">${d}: ${e.weight} kg × ${e.reps} Wdh.</div>`;
          });
          detailHTML += `</div>`;
        });
        detailDiv.innerHTML = detailHTML || "Keine Einträge.";
        detailDiv.style.display = "block";
      });
    });

    document.querySelectorAll(".db-del-user-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.dataset.key;
        const label = btn.dataset.label || key;
        if (!confirm(`Wirklich ALLE Trainingsdaten von "${label}" unwiderruflich löschen?`)) return;
        await remove(ref(db, `gym/logs/${key}`));
        await remove(ref(db, `gym/lastWorkout/${key}`));
        renderDbOverview();
      });
    });
  }

  function chartThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallback) => (styles.getPropertyValue(name).trim() || fallback);
    return {
      accent: read("--accent-soft", "#cdf98a"),
      accentFill: read("--accent-glow", "rgba(159, 232, 74, 0.18)"),
      muted: read("--text-muted", "#999999"),
      dim: read("--text-dim", "#666666"),
      grid: read("--border", "#1c1c1c"),
      text: read("--text-secondary", "#cccccc")
    };
  }

  function formatHistoryTrend(entries) {
    if (!entries.length) return { text: "Noch keine Daten", cls: "" };
    const first = entries[0];
    const last = entries[entries.length - 1];
    const delta = Math.round((Number(last.weight) - Number(first.weight)) * 10) / 10;
    if (!Number.isFinite(delta) || entries.length < 2) {
      return { text: "Erste Einträge", cls: "" };
    }
    if (delta > 0) return { text: `↑ +${delta} kg`, cls: "is-up" };
    if (delta < 0) return { text: `↓ ${delta} kg`, cls: "is-down" };
    return { text: "→ stabil", cls: "" };
  }

  function renderHistoryProgressChart(canvas, entries) {
    if (!canvas || typeof Chart === "undefined") return null;
    const colors = chartThemeColors();
    const points = entries.slice(-8);
    const labels = points.map((e) =>
      new Date(e.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
    );
    const weightData = points.map((e) => Number(e.weight) || 0);
    const repsData = points.map((e) => Number(e.reps) || 0);

    return new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Gewicht",
            data: weightData,
            yAxisID: "yWeight",
            borderColor: colors.accent,
            backgroundColor: colors.accentFill,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: colors.accent,
            pointBorderColor: colors.accent,
            fill: true,
            tension: 0.35
          },
          {
            label: "Wdh.",
            data: repsData,
            yAxisID: "yReps",
            borderColor: colors.muted,
            backgroundColor: "transparent",
            borderWidth: 1.5,
            borderDash: [4, 4],
            pointRadius: 0,
            pointHoverRadius: 3,
            fill: false,
            tension: 0.35
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 450, easing: "easeOutQuart" },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(17,17,17,0.94)",
            titleColor: colors.text,
            bodyColor: colors.text,
            borderColor: colors.grid,
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              title: (items) => items?.[0]?.label || "",
              label: (item) => {
                if (item.dataset.yAxisID === "yWeight") return `${item.parsed.y} kg`;
                return `${item.parsed.y} Wdh.`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: colors.dim,
              font: { size: 10, family: "'DM Sans', sans-serif" },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 5
            }
          },
          yWeight: {
            type: "linear",
            position: "left",
            grace: "12%",
            grid: {
              color: colors.grid,
              drawBorder: false,
              lineWidth: 1
            },
            border: { display: false },
            ticks: {
              color: colors.dim,
              font: { size: 10, family: "'DM Mono', monospace" },
              maxTicksLimit: 4,
              padding: 6,
              callback: (value) => `${value}`
            }
          },
          yReps: {
            type: "linear",
            position: "right",
            grace: "15%",
            grid: { drawOnChartArea: false, drawBorder: false },
            border: { display: false },
            ticks: {
              color: colors.dim,
              font: { size: 10, family: "'DM Mono', monospace" },
              maxTicksLimit: 3,
              padding: 6
            }
          }
        }
      }
    });
  }

  async function renderUserHistory(user) {
    hideWorkoutProgress();
    const wrap = document.getElementById("trainingContent");
    wrap.innerHTML = `<div class="section-title">Historie: ${user}</div><div class="skeleton-card"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:90%"></div><div class="skeleton-line" style="width:40%"></div></div>`;
    const history = await getFullUserHistory(user);
    const exIds = Object.keys(history);
    let html = `<div class="section-title">Entwicklung</div>
      <div class="sub" style="margin-top:-4px;margin-bottom:14px">Gewicht &amp; Wiederholungen der letzten Einheiten — schlank und klar.</div>`;
    html += `<div class="export-btn-wrap"><button id="exportCsvBtn" class="btn-main btn-dark" style="width:auto;padding:10px 18px;display:inline-block">⬇️ Trainingsdaten exportieren (CSV)</button></div>`;
    if (exIds.length === 0) {
      html += `<div class="info-box">Noch keine Übungen protokolliert.</div>`;
    } else {
      exIds.forEach(exId => {
        const entries = history[exId];
        const exName = entries[0]?.exerciseName || exId;
        const chartId = `histChart_${exId}`;

        const chronological = [...entries].sort((a,b) => a.date - b.date);
        const prDates = new Set();
        let maxWeightSoFar = -Infinity;
        chronological.forEach(e => {
          if (e.weight > maxWeightSoFar) {
            maxWeightSoFar = e.weight;
            prDates.add(e.date);
          }
        });

        const latest = chronological[chronological.length - 1];
        const trend = formatHistoryTrend(chronological);
        const latestLabel = latest
          ? `${latest.weight} kg <span>× ${latest.reps} Wdh.</span>`
          : "—";

        html += `<div class="upcoming-wrap">
          <div class="upcoming-title">${exName}</div>
          <div class="hist-summary">
            <div class="hist-summary-main">${latestLabel}</div>
            <div class="hist-summary-trend ${trend.cls}">${trend.text}</div>
          </div>
          <div class="hist-legend">
            <span class="hist-legend-item"><span class="hist-legend-swatch weight"></span>Gewicht</span>
            <span class="hist-legend-item"><span class="hist-legend-swatch reps"></span>Wiederholungen</span>
          </div>
          <div class="hist-chart-wrap"><canvas id="${chartId}"></canvas></div>`;
        chronological.slice().reverse().slice(0, 8).forEach(e => {
          const d = new Date(e.date).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit"});
          const isPR = prDates.has(e.date);
          const prBadge = isPR ? `<span class="pr-badge" title="Neues persönliches Bestgewicht">🏆 PR</span>` : "";
          const rackInfo = (e.rackSetting != null) ? `<div class="upcoming-rack">${e.rackLabel || "Rack-Einstellung"}: Stufe ${e.rackSetting}</div>` : "";
          html += `<div class="upcoming-row log-row" data-exid="${exId}" data-key="${e._key}" data-weight="${e.weight}" data-reps="${e.reps}">
            <div><div class="upcoming-when">${d}</div><div class="upcoming-label">${e.weight} kg × ${e.reps} Wdh. ${prBadge}</div>${rackInfo}</div>
            <div class="log-row-actions">
              <button class="log-edit-btn" title="Bearbeiten">✏️</button>
              <button class="log-delete-btn" title="Löschen">🗑️</button>
            </div>
          </div>`;
        });
        html += `</div>`;
      });
    }
    html += `<button id="backToTrainingBtn" class="btn-main btn-dark" style="margin-top:16px">← Zurück</button>`;
    wrap.innerHTML = html;
    document.getElementById("backToTrainingBtn").addEventListener("click", renderTrainingSetup);
    const exportBtn = document.getElementById("exportCsvBtn");
    if (exportBtn) exportBtn.addEventListener("click", () => exportUserDataAsCSV(user));

    document.querySelectorAll(".log-delete-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const row = btn.closest(".log-row");
        if (!confirm("Diesen Eintrag wirklich löschen?")) return;
        const ok = await deleteLogEntry(user, row.dataset.exid, row.dataset.key);
        if (ok) renderUserHistory(user);
      });
    });

    document.querySelectorAll(".log-edit-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = btn.closest(".log-row");
        if (row.querySelector(".log-edit-form")) return;
        const form = document.createElement("div");
        form.className = "log-edit-form";
        form.innerHTML = `
          <div class="time-grid">
            <input type="number" step="0.5" class="time-input edit-weight" value="${row.dataset.weight}" placeholder="Gewicht (kg)">
            <input type="number" class="time-input edit-reps" value="${row.dataset.reps}" placeholder="Wiederholungen">
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn-main btn-lime save-edit-btn" style="margin-top:0">Speichern</button>
            <button class="btn-main btn-dark cancel-edit-btn" style="margin-top:0">Abbrechen</button>
          </div>`;
        row.appendChild(form);
        form.querySelector(".cancel-edit-btn").addEventListener("click", () => form.remove());
        form.querySelector(".save-edit-btn").addEventListener("click", async () => {
          const newWeight = parseFloat(form.querySelector(".edit-weight").value) || 0;
          const newReps = parseInt(form.querySelector(".edit-reps").value) || 0;
          const original = history[row.dataset.exid].find(x => x._key === row.dataset.key);
          const updated = { ...original, weight: newWeight, reps: newReps };
          delete updated._key;
          const ok = await updateLogEntry(user, row.dataset.exid, row.dataset.key, updated);
          if (ok) renderUserHistory(user);
        });
      });
    });

    if (exIds.length > 0) {
      exIds.forEach((exId) => {
        const chronological = [...history[exId]].sort((a, b) => a.date - b.date);
        const ctx = document.getElementById(`histChart_${exId}`);
        renderHistoryProgressChart(ctx, chronological);
      });
    }
  }

  async function renderWarmup() {
    sessionPhase = "warmup";
    saveActiveSession();
    hideWorkoutProgress();
    const wrap = document.getElementById("trainingContent");
    const goalLabel = GOAL_LABELS[selectedGoal] || selectedGoal || "Eigenes Workout";
    const cardioNote = cardioEnabled === true && selectedCardio.size
      ? ` · Cardio-Finisher möglich (${[...selectedCardio].map((id) => CARDIO_OPTIONS.find((c) => c.id === id)?.label || id).join(", ")})`
      : "";
    const strengthCount = strengthIdsFromQueue().length;
    const mesoNote = activeMesoRx ? mesoBannerHtml() : "";
    wrap.innerHTML = `<div class="section-title">🔥 Aufwärmen (ca. 5 Min.)</div>
      ${mesoNote}
      <div class="info-box" style="margin-bottom:12px">
        Ziel: <strong>${goalLabel}</strong> · ${strengthCount} Kraft-Übungen${cardioNote}
        ${activeMesoRx ? `<br><span class="sub">Bereiche heute: ${(activeMesoRx.bodies || []).map((b) => BODY_LABELS[b] || b).join(", ")}</span>` : ""}
      </div>
      <div class="upcoming-wrap">
        <div class="sub" style="color:#999;margin-bottom:10px">Bevor es losgeht, kurz aufwärmen – hier ein paar Beispiele:</div>
        <ul style="margin:0 0 16px 0;padding-left:20px;color:#ddd;line-height:1.7">
          ${WARMUP_EXAMPLES.map(w => `<li>${w}</li>`).join("")}
        </ul>
        <button id="startExercisesBtn" class="btn-main btn-lime">Weiter zu den Übungen →</button>
      </div>`;
    document.getElementById("startExercisesBtn").addEventListener("click", () => {
      const btn = document.getElementById("startExercisesBtn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Lade Übungen…";
      }
      Promise.resolve()
        .then(() => renderTrainingExercise())
        .catch((err) => {
          console.error("startExercises", err);
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Weiter zu den Übungen →";
          }
          showToast("Übung konnte nicht geladen werden. Bitte erneut tippen.", "error", 4000);
        });
    });
  }

  let restTimerInterval = null;

  function renderRestTimer() {
    sessionPhase = "rest";
    saveActiveSession();
    stopSetRestTimer();
    clearInterval(restTimerInterval);
    setWorkoutProgress(currentExerciseIdx + 1, currentWorkoutQueue.length);
    const wrap = document.getElementById("trainingContent");
    const savedDuration = getSavedRestDuration();
    let remaining = savedDuration;
    const next = currentWorkoutQueue[currentExerciseIdx];
    const nextName = next?.name || "Nächste Übung";
    const setupHint = exerciseSetupHint(next);
    const nextBody = next && !isCardioStep(next) ? (BODY_LABELS[next.body] || next.body) : (isCardioStep(next) ? "Cardio" : "");

    document.body.classList.add("workout-session-active");
    wrap.innerHTML = `<div class="section-title">Pause</div>
      <div class="rest-next-card">
        <div class="rest-next-label">Als Nächstes</div>
        ${nextBody ? `<div class="rest-next-body">${nextBody}</div>` : ""}
        <div class="rest-next-name">${nextName}</div>
        ${setupHint ? `<div class="rest-next-hint">${setupHint}</div>` : ""}
        <div class="sub" style="margin-top:8px">Pause nutzen: Gerät umbauen, Griff wechseln, Rack/Jammer vorbereiten.</div>
      </div>
      <div class="upcoming-wrap" style="text-align:center">
        <div id="restTimerDisplay" style="font-family:'Bebas Neue',sans-serif;font-size:64px;letter-spacing:2px;color:#9fe84a;margin:10px 0">${formatRestTime(remaining)}</div>
        <div class="dur-row" id="restDurRow" style="margin-bottom:14px">
          ${[30,60,90,120].map(s=>`<button class="btn-dur${s===savedDuration?" active":""}" data-sec="${s}">${s}s</button>`).join("")}
        </div>
        <button id="restPauseBtn" class="btn-session-secondary" style="width:100%;margin-bottom:8px">⏸ Pausieren</button>
        <button id="restSkipBtn" class="btn-session-primary" style="width:100%">Weiter →</button>
      </div>`;

    let isPaused = false;
    const display = document.getElementById("restTimerDisplay");

    function tick() {
      if (isPaused) return;
      remaining--;
      if (remaining <= 0) {
        clearInterval(restTimerInterval);
        display.textContent = "0:00";
        showToast("Pause beendet – weiter geht's!", "success", 2500);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        setTimeout(() => renderTrainingExercise(), 600);
        return;
      }
      display.textContent = formatRestTime(remaining);
    }
    restTimerInterval = setInterval(tick, 1000);

    document.querySelectorAll("#restDurRow .btn-dur").forEach(btn => {
      btn.addEventListener("click", () => {
        const sec = parseInt(btn.dataset.sec);
        localStorage.setItem("kg_rest_duration", sec);
        remaining = sec;
        display.textContent = formatRestTime(remaining);
        document.querySelectorAll("#restDurRow .btn-dur").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    document.getElementById("restPauseBtn").addEventListener("click", (e) => {
      isPaused = !isPaused;
      e.target.textContent = isPaused ? "▶ Weiter" : "⏸ Pausieren";
    });

    document.getElementById("restSkipBtn").addEventListener("click", () => {
      clearInterval(restTimerInterval);
      renderTrainingExercise();
    });
  }

  function formatRestTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2,"0")}`;
  }

  async function renderTrainingExercise() {
    stopSetRestTimer();
    const wrap = document.getElementById("trainingContent");
    if (!writeKey()) {
      wrap.innerHTML = requireLoginHtml();
      return;
    }
    if ((!currentWorkoutQueue || currentWorkoutQueue.length === 0) && hasActiveSession()) {
      restoreActiveSession();
    }
    if (currentExerciseIdx >= currentWorkoutQueue.length) {
      hideWorkoutProgress();
      const finishedCount = currentWorkoutQueue.length;
      const bodyList = [...completedBodies];
      const volumeKg = sessionVolumeKg;
      const setCount = sessionSetCount;
      const wasMesoSession = !!activeMesoRx;
      const uid = writeKey();
      let mesoProgress = null;
      if (wasMesoSession && uid) {
        mesoProgress = recordMesocycleSession(uid, sessionMesoSetsByBody);
      }
      currentWorkoutQueue = [];
      currentExerciseIdx = 0;
      clearActiveSession();
      if (!growthMvpInitialized && trainingUser) {
        updateGrowthMvpInitialized(true);
        void recordWorkoutCompletion(trainingUser, finishedCount);
      }
      wrap.innerHTML = renderWorkoutCompleteSummary({
        finishedCount,
        bodyList,
        volumeKg,
        setCount,
        mesoProgress
      });
      document.getElementById("restartTrainingBtn")?.addEventListener("click", renderTrainingSetup);
      document.getElementById("backFromCompleteBtn")?.addEventListener("click", renderTrainingSetup);
      document.getElementById("mesoStartNextBtn")?.addEventListener("click", () => {
        const id = writeKey();
        if (!id) return;
        startNextMesocycle(id, mesoProgress?.meso);
        mesoOptIn = true;
        showToast("Neuer Mesozyklus gestartet (+Volumen).", "success", 2500);
        renderTrainingSetup();
      });
      refreshConnectivityBanner();
      void initWorkoutSyncPanel();
      return;
    }
    updateGrowthMvpInitialized(false);
    sessionPhase = "exercise";
    setWorkoutProgress(currentExerciseIdx + 1, currentWorkoutQueue.length);
    saveActiveSession();
    const ex = currentWorkoutQueue[currentExerciseIdx];

    if (isCardioStep(ex)) {
      wrap.innerHTML = `<div class="upcoming-wrap">
        <div class="upcoming-title">Cardio-Finisher</div>
        <div class="exercise-session-name">${ex.name}</div>
        <div class="info-box" style="margin-bottom:14px">${ex.note || `${ex.minutes} Min. ${ex.name}`}</div>
        <div class="sub" style="margin-bottom:16px">Kein Gewichtslog — einfach die Zeit absolvieren und fertig tippen.</div>
        <button id="doneExBtn" class="btn-session-primary" style="margin-top:8px;width:100%">Cardio erledigt →</button>
        <button id="skipExBtn" class="btn-session-secondary" style="margin-top:8px;width:100%">Überspringen</button>
      </div>`;
      document.getElementById("doneExBtn").addEventListener("click", () => {
        const key = writeKey();
        showToast(`${ex.name} erledigt.`, "success", 2000);
        const wasLast = currentExerciseIdx + 1 >= currentWorkoutQueue.length;
        currentExerciseIdx++;
        currentSets = [];
        pendingRestoredSets = null;
        stopSetRestTimer();
        saveActiveSession();
        if (wasLast) {
          renderTrainingExercise();
        } else {
          renderRestTimer();
        }
        if (key) {
          void saveLastWorkout(key, strengthIdsFromQueue(currentWorkoutQueue.slice(0, currentExerciseIdx)), { silent: true });
          if (wasLast) {
            void saveLastWorkout(key, strengthIdsFromQueue(), { silent: true });
          }
        }
      });
      document.getElementById("skipExBtn").addEventListener("click", () => {
        currentExerciseIdx++;
        currentSets = [];
        pendingRestoredSets = null;
        saveActiveSession();
        renderTrainingExercise();
      });
      return;
    }

    if (!ex || !ex.id) {
      showToast("Übung fehlt in der Session — bitte Training neu starten.", "error", 3500);
      renderTrainingSetup();
      return;
    }

    // Never await network here: offline after warmup must stay responsive.
    const overrides = overridesForExerciseUi();
    const display = getExerciseDisplay(ex, overrides);
    const mediaHTML = renderExerciseMediaHtml(ex, overrides, { compact: true });
    const equipTip = equipmentTipForExercise(ex);
    const instrHTML = display.steps.length ? `
        <button id="toggleInstrBtn" class="exercise-details-toggle" style="margin-top:6px">Anleitung anzeigen</button>
        <div id="instrBox" style="display:none;margin-top:10px;padding:12px;background:#0d0d0d;border-radius:8px">
          <ul style="margin:0;padding-left:18px;color:#ddd;line-height:1.6">
            ${display.steps.map(s => `<li>${s}</li>`).join("")}
          </ul>
          ${display.note ? `<div class="faq-note" style="margin-top:8px;color:#f5c542">${display.note}</div>` : ""}
        </div>` : "";
    const rackFieldHTML = ex.rackSetting ? `
        <div style="margin-top:12px">
          <div class="field-label">${ex.rackLabel || "Rack-Einstellung"} (Stufe)</div>
          <input type="number" step="1" id="logRackSetting" class="time-input" placeholder="z.B. 5" inputmode="numeric">
        </div>` : "";
    const equipInfoBtn = equipTip
      ? `<button type="button" id="equipTipBtn" class="equip-tip-btn" aria-label="Gerätehinweis: ${equipTip.title}" aria-expanded="false" title="${equipTip.title}">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        </button>`
      : "";
    document.body.classList.add("workout-session-active");
    const setsLabel = ex.mesoTargetSets ? `Sätze <span style="color:var(--text-dim);font-weight:400">(Soll: ${ex.mesoTargetSets})</span>` : "Sätze";
    wrap.innerHTML = `<div class="upcoming-wrap workout-ex-card" style="margin-bottom:0;border-bottom:none;border-radius:var(--radius-md) var(--radius-md) 0 0">
        <div class="upcoming-title">${BODY_LABELS[ex.body]}</div>
        <div class="exercise-session-head">
          <div class="exercise-session-name">${display.name}</div>
          ${equipInfoBtn}
        </div>
        ${equipTip ? `<div id="equipTipPopover" class="equip-tip-popover" hidden>
          <div class="equip-tip-popover-title">${equipTip.title}</div>
          <div class="equip-tip-popover-body">${equipTip.html || ""}</div>
          ${equipTip.faqId ? `<button type="button" class="equip-tip-open-guide" data-faq="${equipTip.faqId}">Vollständige Anleitung öffnen</button>` : ""}
        </div>` : ""}
        <div class="last-session-badge" id="lastSessionBadge" hidden></div>
        <div class="exercise-reco-slot" id="recoNote">Lade letzten Wert…</div>
        ${mesoBannerHtml(ex)}
        <div class="field-label" style="margin-bottom:4px">${setsLabel}</div>
        <div id="setsList" class="sets-list-compact"></div>
        <button id="toggleDetailsBtn" class="exercise-details-toggle">▸ Mehr (Anleitung, Zielbereich, Media)</button>
        <div id="exerciseDetailsCollapsible" class="exercise-details-collapsible">
          ${mediaHTML}
          <div class="time-grid" style="margin-top:10px">
            <div><div class="field-label">Ziel min. Wdh.</div><input type="number" id="logMin" class="time-input" placeholder="${ex.defMin}" inputmode="numeric"></div>
            <div><div class="field-label">Ziel max. Wdh.</div><input type="number" id="logMax" class="time-input" placeholder="${ex.defMax}" inputmode="numeric"></div>
          </div>
          <div style="margin-top:10px">
            <div class="field-label">RIR${ex.mesoTargetRirMin != null ? ` (${ex.mesoTargetRirMin}–${ex.mesoTargetRirMax})` : ""}</div>
            <input type="number" min="0" max="5" id="logRir" class="time-input" placeholder="${ex.mesoTargetRirMin != null ? ex.mesoTargetRirMin : "2"}" value="${ex.mesoTargetRirMin != null ? ex.mesoTargetRirMin : ""}" inputmode="numeric">
          </div>
          ${rackFieldHTML}
          ${instrHTML ? `<div style="margin-top:10px">${instrHTML}</div>` : ""}
        </div>
      </div>
      <div class="workout-action-bar workout-action-bar--thumb" id="workoutActionBar">
        <div class="set-input-dock">
          <div class="set-adj-group">
            <div class="field-label">Gewicht</div>
            <div class="set-adj-row">
              <button type="button" class="set-adj-btn" data-adj="weight" data-delta="-2.5" aria-label="Gewicht −2,5 kg">−2.5</button>
              <button type="button" class="set-adj-btn" data-adj="weight" data-delta="-1" aria-label="Gewicht −1 kg">−1</button>
              <input type="number" step="0.5" id="logWeight" class="time-input set-adj-input" placeholder="kg" inputmode="decimal">
              <button type="button" class="set-adj-btn" data-adj="weight" data-delta="1" aria-label="Gewicht +1 kg">+1</button>
              <button type="button" class="set-adj-btn" data-adj="weight" data-delta="2.5" aria-label="Gewicht +2,5 kg">+2.5</button>
            </div>
          </div>
          <div class="set-adj-group">
            <div class="field-label">Wdh.</div>
            <div class="set-adj-row">
              <button type="button" class="set-adj-btn" data-adj="reps" data-delta="-1" aria-label="Wiederholungen −1">−1</button>
              <input type="number" id="logReps" class="time-input set-adj-input" placeholder="10" inputmode="numeric">
              <button type="button" class="set-adj-btn" data-adj="reps" data-delta="1" aria-label="Wiederholungen +1">+1</button>
            </div>
          </div>
        </div>
        <button id="addSetBtn" class="btn-session-primary btn-complete-set">Satz abschließen</button>
        <div class="workout-action-secondary">
          <button id="doneExBtn" class="btn-session-secondary">Fertig</button>
          <button id="skipExBtn" class="btn-session-secondary">Skip</button>
        </div>
      </div>
      <button id="abandonTrainingBtn" class="owner-link" style="margin-top:8px;display:block;width:100%;text-align:center;padding-bottom:env(safe-area-inset-bottom, 8px)">Training abbrechen</button>`;

    document.getElementById("toggleDetailsBtn")?.addEventListener("click", () => {
      const panel = document.getElementById("exerciseDetailsCollapsible");
      const btn = document.getElementById("toggleDetailsBtn");
      const isOpen = panel.classList.contains("open");
      panel.classList.toggle("open", !isOpen);
      btn.textContent = isOpen ? "▸ Mehr (Anleitung, Zielbereich, Media)" : "▾ Weniger";
    });

    if (instrHTML) {
      document.getElementById("toggleInstrBtn")?.addEventListener("click", () => {
        const box = document.getElementById("instrBox");
        const btn = document.getElementById("toggleInstrBtn");
        const isHidden = box.style.display === "none";
        box.style.display = isHidden ? "block" : "none";
        btn.textContent = isHidden ? "Anleitung ausblenden" : "Anleitung anzeigen";
      });
    }

    if (equipTip) {
      const tipBtn = document.getElementById("equipTipBtn");
      const pop = document.getElementById("equipTipPopover");
      tipBtn?.addEventListener("click", () => {
        const open = pop.hasAttribute("hidden");
        if (open) pop.removeAttribute("hidden");
        else pop.setAttribute("hidden", "");
        tipBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      pop?.querySelector(".equip-tip-open-guide")?.addEventListener("click", () => {
        const faqId = equipTip.faqId;
        saveActiveSession();
        document.body.classList.remove("workout-session-active");
        const tabBtn = document.querySelector(`.bottom-tab[data-tab="ausstattung"]`);
        tabBtn?.click();
        requestAnimationFrame(() => {
          const item = document.querySelector(`[data-equip-tip="${faqId}"]`);
          if (!item) return;
          const section = item.closest(".faq-section");
          section?.classList.add("open");
          item.classList.add("open");
          item.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });
    }

    initExerciseMediaFallbacks(wrap);

    if (Array.isArray(pendingRestoredSets)) {
      currentSets = pendingRestoredSets;
      pendingRestoredSets = null;
    } else if (!Array.isArray(currentSets)) {
      currentSets = [];
    }

    function renderSetsList() {
      const listEl = document.getElementById("setsList");
      if (!listEl) return;
      if (!currentSets.length) {
        listEl.innerHTML = "";
        return;
      }
      listEl.innerHTML = currentSets.map((s, i) => `
        <span class="set-chip">
          <strong>${s.weight}</strong>kg × <strong>${s.reps}</strong>${s.rir != null ? ` R${s.rir}` : ""}
          <button data-idx="${i}" class="remove-set-btn" aria-label="Satz entfernen">✕</button>
        </span>`).join("");
      listEl.querySelectorAll(".remove-set-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          currentSets.splice(parseInt(btn.dataset.idx), 1);
          renderSetsList();
          saveActiveSession();
        });
      });
    }
    renderSetsList();

    const updatePrimaryLabel = () => {
      const btn = document.getElementById("addSetBtn");
      if (!btn) return;
      const w = document.getElementById("logWeight")?.value;
      const r = document.getElementById("logReps")?.value;
      if (w && r) {
        btn.textContent = `Satz abschließen · ${w} kg × ${r}`;
      } else {
        btn.textContent = "Satz abschließen";
      }
    };

    function nudgeInput(kind, delta) {
      const el = document.getElementById(kind === "weight" ? "logWeight" : "logReps");
      if (!el) return;
      const step = kind === "weight" ? 0.5 : 1;
      const cur = parseFloat(el.value);
      const base = Number.isFinite(cur) ? cur : 0;
      let next = Math.round((base + delta) / step) * step;
      if (kind === "reps") next = Math.max(0, Math.round(next));
      else next = Math.max(0, Math.round(next * 10) / 10);
      el.value = String(next);
      updatePrimaryLabel();
      if (navigator.vibrate) navigator.vibrate(12);
    }

    wrap.querySelectorAll(".set-adj-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const adj = btn.dataset.adj;
        const delta = parseFloat(btn.dataset.delta);
        if (!adj || !Number.isFinite(delta)) return;
        nudgeInput(adj, delta);
      });
    });

    document.getElementById("addSetBtn").addEventListener("click", () => {
      const weight = parseFloat(document.getElementById("logWeight").value) || 0;
      const reps = parseInt(document.getElementById("logReps").value) || 0;
      const rirRaw = document.getElementById("logRir")?.value ?? "";
      const rir = rirRaw !== "" ? parseInt(rirRaw) : null;
      if (reps <= 0) {
        showToast("Bitte Wiederholungen für den Satz eingeben.", "error", 2200);
        return;
      }
      currentSets.push({ weight, reps, rir });
      renderSetsList();
      let toastMsg = `Satz ${currentSets.length} gespeichert.`;
      if (ex.mesoTargetSets) {
        if (currentSets.length === ex.mesoTargetSets) {
          toastMsg = `Soll erreicht (${ex.mesoTargetSets} Sätze).`;
        } else if (currentSets.length > ex.mesoTargetSets) {
          toastMsg = `Über Soll (${currentSets.length}/${ex.mesoTargetSets}).`;
        } else {
          toastMsg = `Satz ${currentSets.length}/${ex.mesoTargetSets}.`;
        }
        if (rir != null && (rir < ex.mesoTargetRirMin || rir > ex.mesoTargetRirMax)) {
          toastMsg += ` RIR-Ziel ${ex.mesoTargetRirMin}–${ex.mesoTargetRirMax}.`;
        }
      }
      showToast(toastMsg, "success", 1600);
      if (navigator.vibrate) navigator.vibrate(30);
      saveActiveSession();
      startSetRestTimer({ setNumber: currentSets.length });
    });

    document.getElementById("logWeight")?.addEventListener("input", updatePrimaryLabel);
    document.getElementById("logReps")?.addEventListener("input", updatePrimaryLabel);

    document.getElementById("abandonTrainingBtn")?.addEventListener("click", () => {
      if (!confirm("Training abbrechen? Fortschritt der offenen Übung geht lokal verloren (bereits gespeicherte Übungen bleiben).")) return;
      abandonActiveTraining();
      showToast("Training abgebrochen.", "info", 2000);
      renderTrainingSetup();
    });

    // Buttons sofort aktivieren, nicht erst nach der Firebase-Abfrage des letzten Logs
    document.getElementById("doneExBtn").addEventListener("click", () => {
      // Falls im letzten Feld noch ein Satz steht, der nicht per "+ Satz hinzufügen" gespeichert wurde, automatisch übernehmen
      const pendingWeight = parseFloat(document.getElementById("logWeight").value) || 0;
      const pendingReps = parseInt(document.getElementById("logReps").value) || 0;
      const pendingRirRaw = document.getElementById("logRir")?.value ?? "";
      const pendingRir = pendingRirRaw !== "" ? parseInt(pendingRirRaw) : null;
      if (pendingReps > 0 && (!currentSets.length || currentSets[currentSets.length-1].reps !== pendingReps || currentSets[currentSets.length-1].weight !== pendingWeight)) {
        const lastSet = currentSets[currentSets.length-1];
        const isDuplicate = lastSet && lastSet.reps === pendingReps && lastSet.weight === pendingWeight;
        if (!isDuplicate) currentSets.push({ weight: pendingWeight, reps: pendingReps, rir: pendingRir });
      }
      if (!currentSets.length) {
        showToast("Bitte mindestens einen Satz eingeben.", "error", 2200);
        return;
      }
      const avgWeight = Math.round((currentSets.reduce((sum, s) => sum + s.weight, 0) / currentSets.length) * 10) / 10;
      const avgReps = Math.round(currentSets.reduce((sum, s) => sum + s.reps, 0) / currentSets.length);
      const minReps = parseInt(document.getElementById("logMin").value) || ex.defMin;
      const maxReps = parseInt(document.getElementById("logMax").value) || ex.defMax;
      const lastSetRir = currentSets[currentSets.length - 1]?.rir;
      const setCount = currentSets.length;
      const logEntry = {
        weight: avgWeight,
        reps: avgReps,
        minReps,
        maxReps,
        rir: (lastSetRir != null && !isNaN(lastSetRir)) ? lastSetRir : null,
        date: Date.now(),
        exerciseName: ex.name,
        sets: currentSets.map(s => ({ weight: s.weight, reps: s.reps, rir: (s.rir != null && !isNaN(s.rir)) ? s.rir : null }))
      };
      if (ex.rackSetting) {
        const rackInput = document.getElementById("logRackSetting");
        const rackVal = rackInput ? parseFloat(rackInput.value) : NaN;
        logEntry.rackSetting = isNaN(rackVal) ? null : rackVal;
        logEntry.rackLabel = ex.rackLabel || "Rack-Einstellung";
      }
      const key = writeKey();
      if (!key) {
        showToast("Bitte zuerst anmelden, bevor du speicherst.", "error", 3000);
        return;
      }
      if (!trainingUser) {
        showToast("Bitte zuerst deinen Anzeigenamen im Profil setzen.", "error", 3000);
        return;
      }

      completedBodies.add(ex.body);
      sessionVolumeKg += setsVolumeKg(currentSets);
      sessionSetCount += setCount;
      if (activeMesoRx && ex.body) {
        sessionMesoSetsByBody[ex.body] = (Number(sessionMesoSetsByBody[ex.body]) || 0) + setCount;
      }
      const wasLastExercise = currentExerciseIdx + 1 >= currentWorkoutQueue.length;
      const nextIdx = currentExerciseIdx + 1;
      currentExerciseIdx = nextIdx;
      currentSets = [];
      pendingRestoredSets = null;
      stopSetRestTimer();
      saveActiveSession();

      if (wasLastExercise) {
        renderTrainingExercise();
      } else {
        renderRestTimer();
      }

      persistExerciseCompletionInBackground({
        key,
        exId: ex.id,
        logEntry,
        avgWeight,
        avgReps,
        setCount,
        progressExerciseIds: strengthIdsFromQueue(currentWorkoutQueue.slice(0, nextIdx)),
        finalExerciseIds: wasLastExercise ? strengthIdsFromQueue() : null
      });
    });
    document.getElementById("skipExBtn").addEventListener("click", () => {
      currentExerciseIdx++;
      currentSets = [];
      pendingRestoredSets = null;
      saveActiveSession();
      renderTrainingExercise();
    });

    void getLastLog(readKey() || writeKey(), ex.id).then((last) => {
      const recoEl = document.getElementById("recoNote");
      const badgeEl = document.getElementById("lastSessionBadge");
      if (!recoEl) return;
      const badge = formatLastSessionBadge(last);
      if (badgeEl && badge) {
        badgeEl.hidden = false;
        badgeEl.textContent = badge;
      }
      const reco = computeRecommendation(last, ex);
      recoEl.innerHTML = reco.note + (reco.weight
        ? `<br><strong class="reco-target">Ziel jetzt: ${reco.weight} kg × ${reco.reps} Wdh.</strong>`
        : `<br><strong class="reco-target">Ziel jetzt: ${reco.reps} Wdh. (Gewicht selbst wählen)</strong>`);
      const weightEl = document.getElementById("logWeight");
      const repsEl = document.getElementById("logReps");
      const minEl = document.getElementById("logMin");
      const maxEl = document.getElementById("logMax");
      if (weightEl) weightEl.value = reco.weight || "";
      if (repsEl) repsEl.value = reco.reps || "";
      if (minEl) minEl.value = (last && last.minReps) || "";
      if (maxEl) maxEl.value = (last && last.maxReps) || "";
      if (ex.rackSetting) {
        const rackInput = document.getElementById("logRackSetting");
        if (rackInput) rackInput.value = (last && last.rackSetting != null) ? last.rackSetting : "";
      }
      updatePrimaryLabel();
    }).catch(() => {
      const recoEl = document.getElementById("recoNote");
      if (recoEl) recoEl.textContent = "Keine Empfehlung verfügbar (offline).";
    });
  }


  function setSelectedDuration(min) {
    const parsed = parseInt(min, 10);
    if (!Number.isNaN(parsed)) selectedDuration = parsed;
  }

  function getSelectedDuration() {
    return selectedDuration;
  }

  return {
    BODY_TO_FRONT_IDS,
    BODY_TO_BACK_IDS,
    renderMuscleSVG,
    exportUserDataAsCSV,
    get selectedBody() { return selectedBody; },
    get selectedLevel() { return selectedLevel; },
    get selectedDuration() { return selectedDuration; },
    get selectedGoal() { return selectedGoal; },
    get cardioEnabled() { return cardioEnabled; },
    get selectedCardio() { return selectedCardio; },
    get currentWorkoutQueue() { return currentWorkoutQueue; },
    get currentExerciseIdx() { return currentExerciseIdx; },
    get completedBodies() { return completedBodies; },
    get currentSets() { return currentSets; },
    WARMUP_EXAMPLES,
    get manualOrderedExerciseIds() { return manualOrderedExerciseIds; },
    get manualSelectedExerciseIds() { return new Set(manualOrderedExerciseIds); },
    updateCustomWorkoutOrder,
    exercisesPerDuration,
    buildWorkout,
    logRef,
    lastWorkoutRef,
    allLogsRef: logsRootRef,
    getLastLog,
    getFullUserHistory,
    updateLogEntry,
    deleteLogEntry,
    getAllUsers,
    saveLastWorkout,
    flushOfflineQueue,
    pendingOfflineCount: pendingCount,
    getLastWorkout,
    getCustomWorkouts,
    saveCustomWorkout,
    deleteCustomWorkout,
    renderExercisePickerList,
    renderCustomWorkoutsSection,
    renderManualWorkoutBuilder,
    calculateNextWeight,
    computeRecommendation,
    renderTrainingSetup,
    refreshLastWorkoutBox,
    renderDbOverview,
    renderUserHistory,
    renderWarmup,
    renderRestTimer,
    formatRestTime,
    renderTrainingExercise,
    setWorkoutProgress,
    hideWorkoutProgress,
    startSetRestTimer,
    stopSetRestTimer,
    saveActiveSession,
    hasActiveSession,
    resumeActiveTraining,
    abandonActiveTraining,
    setSelectedDuration,
    getSelectedDuration
  };
}
