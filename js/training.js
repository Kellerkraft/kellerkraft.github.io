import { ref, get, set, remove, push } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "./firebase.js";
import { getAuthSnapshot } from "./auth.js";
import { Paths, safeUserKey as modelSafeUserKey } from "./data-model.js";
import { BODY_LABELS as DATA_BODY_LABELS, LEVEL_LABELS, LEVEL_ORDER, LEVEL_DESC } from "./data.js";

export function createTrainingModule(ctx = {}) {
  const BODY_LABELS = ctx.BODY_LABELS || ctx.bodyLabels || DATA_BODY_LABELS;
  const showToast = ctx.showToast || (() => {});
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
      <div class="section-title">Training</div>
      <div class="info-box">
        Training ist nur nach Anmeldung möglich — damit deine Daten fest zu deinem Konto gehören.
        <br><br>
        Gehe zur <strong>Übersicht</strong>, melde dich mit E-Mail und Passwort an, und speichere deinen Profilnamen.
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

  function renderMuscleSVG(activeBodies) {
    const frontIds = new Set();
    const backIds = new Set();
    activeBodies.forEach(b => {
      (BODY_TO_FRONT_IDS[b] || []).forEach(id => frontIds.add(id));
      (BODY_TO_BACK_IDS[b] || []).forEach(id => backIds.add(id));
    });
    const fA = id => frontIds.has(id) ? " active" : "";
    const bA = id => backIds.has(id) ? " active" : "";

    return `
      <div class="muscle-view-grid">
        <div class="muscle-view-card">
          <div class="muscle-view-label">Vorderansicht</div>
          <svg class="muscle-svg" viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg">
            <ellipse class="muscle-static" cx="100" cy="32" rx="16" ry="19"/>
            <path class="muscle-static" d="M92,48 L108,48 L109,60 L91,60 Z"/>
            <path class="muscle${fA('f-shoulder-l')}" id="f-shoulder-l" d="M60,62 Q45,60 40,72 Q38,82 46,88 L60,80 Z"/>
            <path class="muscle${fA('f-shoulder-r')}" id="f-shoulder-r" d="M140,62 Q155,60 160,72 Q162,82 154,88 L140,80 Z"/>
            <path class="muscle${fA('f-chest')}" id="f-chest" d="M65,64 Q100,58 135,64 L133,104 Q100,112 67,104 Z"/>
            <path class="muscle${fA('f-abs')}" id="f-abs" d="M70,106 L130,106 L126,160 Q100,166 74,160 Z"/>
            <path class="muscle${fA('f-bicep-l')}" id="f-bicep-l" d="M44,90 L58,82 L60,120 L48,126 Z"/>
            <path class="muscle${fA('f-bicep-r')}" id="f-bicep-r" d="M156,90 L142,82 L140,120 L152,126 Z"/>
            <path class="muscle-static" d="M46,128 L60,122 L58,168 L48,172 Z"/>
            <path class="muscle-static" d="M154,128 L140,122 L142,168 L152,172 Z"/>
            <path class="muscle-static" d="M72,162 L128,162 L122,182 Q100,188 78,182 Z"/>
            <path class="muscle${fA('f-quad-l')}" id="f-quad-l" d="M78,184 L98,182 L95,270 L80,270 Z"/>
            <path class="muscle${fA('f-quad-r')}" id="f-quad-r" d="M122,184 L102,182 L105,270 L120,270 Z"/>
            <path class="muscle${fA('f-calf-l')}" id="f-calf-l" d="M80,272 L94,272 L91,340 L82,340 Z"/>
            <path class="muscle${fA('f-calf-r')}" id="f-calf-r" d="M120,272 L106,272 L109,340 L118,340 Z"/>
          </svg>
        </div>
        <div class="muscle-view-card">
          <div class="muscle-view-label">Rückansicht</div>
          <svg class="muscle-svg" viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg">
            <ellipse class="muscle-static" cx="100" cy="32" rx="16" ry="19"/>
            <path class="muscle${bA('b-trap')}" id="b-trap" d="M78,50 L122,50 L128,72 L100,80 L72,72 Z"/>
            <path class="muscle${bA('b-shoulder-l')}" id="b-shoulder-l" d="M60,64 Q45,62 40,74 Q38,84 46,90 L60,82 Z"/>
            <path class="muscle${bA('b-shoulder-r')}" id="b-shoulder-r" d="M140,64 Q155,62 160,74 Q162,84 154,90 L140,82 Z"/>
            <path class="muscle${bA('b-lat-l')}" id="b-lat-l" d="M62,82 L98,80 L94,140 Q76,146 64,138 Z"/>
            <path class="muscle${bA('b-lat-r')}" id="b-lat-r" d="M138,82 L102,80 L106,140 Q124,146 136,138 Z"/>
            <path class="muscle${bA('b-lower')}" id="b-lower" d="M76,142 L124,142 L120,168 Q100,174 80,168 Z"/>
            <path class="muscle${bA('b-tricep-l')}" id="b-tricep-l" d="M44,92 L58,84 L60,122 L48,128 Z"/>
            <path class="muscle${bA('b-tricep-r')}" id="b-tricep-r" d="M156,92 L142,84 L140,122 L152,128 Z"/>
            <path class="muscle-static" d="M46,130 L60,124 L58,170 L48,174 Z"/>
            <path class="muscle-static" d="M154,130 L140,124 L142,170 L152,174 Z"/>
            <path class="muscle${bA('b-glute-l')}" id="b-glute-l" d="M74,170 L100,168 L98,196 L76,198 Z"/>
            <path class="muscle${bA('b-glute-r')}" id="b-glute-r" d="M126,170 L100,168 L102,196 L124,198 Z"/>
            <path class="muscle${bA('b-ham-l')}" id="b-ham-l" d="M78,198 L98,196 L95,270 L80,270 Z"/>
            <path class="muscle${bA('b-ham-r')}" id="b-ham-r" d="M122,198 L102,196 L105,270 L120,270 Z"/>
            <path class="muscle${bA('b-calf-l')}" id="b-calf-l" d="M80,272 L94,272 L91,340 L82,340 Z"/>
            <path class="muscle${bA('b-calf-r')}" id="b-calf-r" d="M120,272 L106,272 L109,340 L118,340 Z"/>
          </svg>
        </div>
      </div>
      <div class="muscle-legend"><span class="legend-dot active"></span> Trainiert <span class="legend-dot" style="margin-left:14px"></span> Nicht trainiert</div>`;
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
  }
  let selectedBody = new Set();
  let selectedLevel = null;
  let selectedDuration = 30;
  let currentWorkoutQueue = [];
  let currentExerciseIdx = 0;
  let completedBodies = new Set();
  let currentSets = []; // Saetze der aktuell angezeigten Uebung: [{weight, reps}, ...]

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

  function buildWorkout() {
    const allowedLevels = levelsUpTo(selectedLevel || "advanced");
    const all = getAllExercises();
    let pool = all.filter(e => selectedBody.has(e.body) && allowedLevels.includes(e.level));
    if (pool.length === 0) pool = all.filter(e => allowedLevels.includes(e.level));
    const count = Math.min(exercisesPerDuration(selectedDuration), pool.length || 1);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const byBody = {};
    const result = [];
    shuffled.forEach(e => { if(!byBody[e.body]) { byBody[e.body] = true; result.push(e); } });
    shuffled.forEach(e => { if (result.length < count && !result.includes(e)) result.push(e); });
    return result.slice(0, count);
  }

  function logRef(key, exId) { return ref(db, `gym/logs/${key}/${exId}`); }
  function lastWorkoutRef(key) { return ref(db, `gym/lastWorkout/${key}`); }
  function logsRootRef() { return ref(db, "gym/logs"); }

  function mergeEntryMaps(a = {}, b = {}) {
    return { ...a, ...b };
  }

  async function loadLogTree(key) {
    if (!key) return {};
    try {
      const snap = await get(ref(db, Paths.logs(key)));
      return snap.val() || {};
    } catch {
      return {};
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

  async function saveLastWorkout(key, exerciseIds) {
    try {
      await set(lastWorkoutRef(key), {
        date: Date.now(),
        duration: selectedDuration,
        body: [...selectedBody],
        level: selectedLevel,
        exerciseIds
      });
    } catch (err) {
      showToast("Workout konnte nicht gespeichert werden.", "error");
    }
  }

  async function getLastWorkout(key) {
    try {
      const snap = await get(lastWorkoutRef(key));
      const val = snap.val();
      if (val) return val;
      // Legacy name fallback for own account only
      const { isOwner } = account();
      if (!isOwner && trainingUser && safeUserKey(trainingUser) !== key) {
        const legacy = await get(lastWorkoutRef(safeUserKey(trainingUser)));
        return legacy.val();
      }
      return null;
    } catch {
      return null;
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
    wrap.innerHTML = `
      <div class="section-title" style="margin-top:24px">Eigene Workouts</div>
      ${saved.length ? `<div class="faq-wrap" style="margin-bottom:12px">${saved.map(w => `
        <div class="faq-item" data-workoutid="${w.id}">
          <button class="faq-question">${w.name} <span style="opacity:0.6; font-size:0.85em">(${(w.exerciseIds || []).length} Übungen)</span> <span class="faq-chevron">▾</span></button>
          <div class="faq-answer"><div class="faq-answer-inner">
            <div class="sub" style="margin-bottom:6px">Reihenfolge mit ↑↓ anpassen — wird sofort gespeichert.</div>
            ${exerciseOrderListHtml(w.exerciseIds || [], { dataWorkoutId: w.id })}
            <div style="display:flex; gap:10px; margin-top:10px;">
              <button class="btn-main btn-lime start-custom-workout-btn" data-workoutid="${w.id}" style="flex:1;">▶️ Starten</button>
              <button class="btn-main btn-dark delete-custom-workout-btn" data-workoutid="${w.id}" style="flex:1;">🗑️ Löschen</button>
            </div>
          </div></div>
        </div>
      `).join("")}</div>` : `<div class="info-box" style="margin-bottom:12px">Noch keine eigenen Workouts gespeichert.</div>`}
      <button id="createManualWorkoutBtn" class="btn-main btn-dark" style="width:100%">➕ Eigenes Workout erstellen</button>
      <div id="manualWorkoutBuilder"></div>
    `;

    wrap.querySelectorAll(".faq-question").forEach(btn => {
      btn.addEventListener("click", () => btn.closest(".faq-item").classList.toggle("open"));
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
        document.querySelector(`.faq-item[data-workoutid="${workoutId}"]`)?.classList.add("open");
      });
    });
    wrap.querySelectorAll(".start-custom-workout-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const w = saved.find(x => x.id === btn.dataset.workoutid);
        if (!w) return;
        currentWorkoutQueue = (w.exerciseIds || []).map(id => findExercise(id)).filter(Boolean);
        if (currentWorkoutQueue.length === 0) { alert("Übungen aus diesem Workout nicht mehr verfügbar."); return; }
        currentExerciseIdx = 0;
        completedBodies = new Set();
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
    document.getElementById("createManualWorkoutBtn").addEventListener("click", () => {
      manualOrderedExerciseIds = [];
      renderManualWorkoutBuilder();
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
      return { nextWeight, message };
    }

    if (lastSession.rir >= 3) {
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

  async function renderTrainingSetup() {
    syncTrainingUser();
    hideWorkoutProgress();
    const wrap = document.getElementById("trainingContent");
    const { isPermanent, email, isOwner, uid } = account();

    if (!isPermanent || !uid) {
      ownerViewKey = null;
      wrap.innerHTML = requireLoginHtml();
      return;
    }

    // Non-owner always works on own uid
    if (!isOwner) ownerViewKey = null;
    if (isOwner && !ownerViewKey) ownerViewKey = uid;

    await loadCustomExercises();
    const activeKey = readKey();
    const viewingOther = isOwner && ownerViewKey && ownerViewKey !== uid;

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
      ${ownerChipsHTML}
      <div class="section-title">${viewingOther ? "Ansicht fremdes Profil" : "Dein Trainingsprofil"}</div>
      <div class="info-box" style="margin-bottom:12px">
        Angemeldet als <strong>${email || "Konto"}</strong><br>
        Anzeigename: <strong>${trainingUser || "— bitte unter Übersicht im Profil setzen —"}</strong>
        ${viewingOther ? `<br><span style="color:#f5c542">Owner schaut Daten von Key <code>${ownerViewKey}</code> an (nur Lesen/Verwalten).</span>` : ""}
      </div>
      ${!viewingOther ? `
        <input id="userNameInput" class="name-input" placeholder="Dein Anzeigename" maxlength="40" value="${trainingUser}">
        <div class="sub" style="margin-bottom:10px">Name wird in deinem Profil gespeichert — Trainingsdaten liegen an deinem Konto (nicht am Namen).</div>
      ` : ""}
      <div id="lastWorkoutBox"></div>
      <div style="text-align:center;margin-top:10px"><button id="viewHistoryBtn" class="owner-link">📊 Bisherige Übungen ansehen</button></div>

      ${!viewingOther ? `
      <div class="section-title" style="margin-top:20px">Dauer</div>
      <div class="dur-row" id="trainDurRow">
        ${[15, 30, 45, 60].map((m) => `<button class="btn-dur${m === selectedDuration ? " active" : ""}" data-min="${m}">${m} min</button>`).join("")}
      </div>

      <div class="section-title" style="margin-top:20px">Körperbereich</div>
      <div class="chip-row" id="bodyChips">
        ${Object.entries(BODY_LABELS).map(([k, l]) => `<button class="chip${selectedBody.has(k) ? " active" : ""}" data-body="${k}">${l}</button>`).join("")}
      </div>

      <div class="section-title" style="margin-top:20px">Level</div>
      <div class="chip-row" id="levelChips" style="flex-direction:column; gap:8px; display:flex;">
        ${LEVEL_ORDER.map((k) => `<button class="chip level-chip${selectedLevel === k ? " active" : ""}" data-level="${k}" style="width:100%; text-align:left; padding:12px 14px;">
          <strong>${LEVEL_LABELS[k]}</strong><br><span style="font-size:0.85em; opacity:0.75;">${LEVEL_DESC[k]}</span>
        </button>`).join("")}
      </div>

      <button id="startTrainingBtn" class="btn-main btn-lime" style="margin-top:24px">Workout erstellen →</button>
      <div id="customWorkoutsSection"></div>
      ` : `<div class="info-box" style="margin-top:16px">Im Owner-Fremdprofil kannst du Historie einsehen/löschen, aber kein Workout für andere starten.</div>`}
    `;

    if (isOwner) {
      document.querySelectorAll(".profile-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
          ownerViewKey = btn.dataset.key;
          const label = btn.textContent.trim();
          if (ownerViewKey === uid) {
            // keep own display name
          } else {
            // don't overwrite own trainingUser permanently when peeking
          }
          renderTrainingSetup();
        });
      });
    }

    document.getElementById("userNameInput")?.addEventListener("input", (e) => {
      updateTrainingUser(e.target.value.trim());
      refreshLastWorkoutBox();
      renderCustomWorkoutsSection();
    });
    document.querySelectorAll("#trainDurRow .btn-dur").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#trainDurRow .btn-dur").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedDuration = parseInt(btn.dataset.min, 10);
      });
    });
    document.querySelectorAll("#bodyChips .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.body;
        if (selectedBody.has(k)) { selectedBody.delete(k); btn.classList.remove("active"); }
        else { selectedBody.add(k); btn.classList.add("active"); }
      });
    });
    document.querySelectorAll("#levelChips .chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedLevel = btn.dataset.level;
        document.querySelectorAll("#levelChips .chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
    document.getElementById("startTrainingBtn")?.addEventListener("click", () => {
      if (!writeKey()) { alert("Bitte zuerst anmelden."); return; }
      if (!trainingUser) { alert("Bitte Anzeigenamen setzen (Profil)."); return; }
      if (selectedBody.size === 0 || !selectedLevel) { alert("Bitte mindestens einen Körperbereich und ein Level wählen."); return; }
      currentWorkoutQueue = buildWorkout();
      currentExerciseIdx = 0;
      completedBodies = new Set();
      renderWarmup();
    });
    document.getElementById("viewHistoryBtn")?.addEventListener("click", () => {
      const key = readKey();
      if (!key) { alert("Kein Profil geladen."); return; }
      renderUserHistory(key);
    });
    refreshLastWorkoutBox();
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

  async function renderUserHistory(user) {
    hideWorkoutProgress();
    const wrap = document.getElementById("trainingContent");
    wrap.innerHTML = `<div class="section-title">Historie: ${user}</div><div class="skeleton-card"><div class="skeleton-line" style="width:60%"></div><div class="skeleton-line" style="width:90%"></div><div class="skeleton-line" style="width:40%"></div></div>`;
    const history = await getFullUserHistory(user);
    const exIds = Object.keys(history);
    let html = `<div class="section-title">Historie: ${user}</div>`;
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

        html += `<div class="upcoming-wrap"><div class="upcoming-title">${exName}</div>`;
        html += `<div class="hist-chart-wrap"><canvas id="${chartId}"></canvas></div>`;
        entries.slice(0,10).forEach(e => {
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
      exIds.forEach(exId => {
        const entries = [...history[exId]].sort((a,b) => a.date - b.date).slice(-15);
        const labels = entries.map(e => new Date(e.date).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"}));
        const repsData = entries.map(e => e.reps);
        const weightData = entries.map(e => e.weight);
        const ctx = document.getElementById(`histChart_${exId}`);
        if (!ctx) return;
        new Chart(ctx, {
          type: "line",
          data: {
            labels,
            datasets: [
              { label: "Wiederholungen", data: repsData, borderColor: "#4da6ff", backgroundColor: "#4da6ff", yAxisID: "yReps", tension: 0.25, pointRadius: 3 },
              { label: "Gewicht (kg)", data: weightData, borderColor: "#ff4d4d", backgroundColor: "#ff4d4d", yAxisID: "yWeight", tension: 0.25, pointRadius: 3 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { labels: { color: "#ddd", font: { size: 10 } } } },
            scales: {
              x: { ticks: { color: "#999", font: { size: 9 } }, grid: { color: "#1e1e1e" } },
              yReps: { type: "linear", position: "left", ticks: { color: "#4da6ff", font: { size: 9 } }, grid: { color: "#1e1e1e" }, title: { display: true, text: "Wdh.", color: "#4da6ff", font: { size: 10 } } },
              yWeight: { type: "linear", position: "right", ticks: { color: "#ff4d4d", font: { size: 9 } }, grid: { drawOnChartArea: false }, title: { display: true, text: "kg", color: "#ff4d4d", font: { size: 10 } } }
            }
          }
        });
      });
    }
  }

  async function renderWarmup() {
    hideWorkoutProgress();
    const wrap = document.getElementById("trainingContent");
    wrap.innerHTML = `<div class="section-title">🔥 Aufwärmen (ca. 5 Min.)</div>
      <div class="upcoming-wrap">
        <div class="sub" style="color:#999;margin-bottom:10px">Bevor es losgeht, kurz aufwärmen – hier ein paar Beispiele:</div>
        <ul style="margin:0 0 16px 0;padding-left:20px;color:#ddd;line-height:1.7">
          ${WARMUP_EXAMPLES.map(w => `<li>${w}</li>`).join("")}
        </ul>
        <button id="startExercisesBtn" class="btn-main btn-lime">Weiter zu den Übungen →</button>
      </div>`;
    document.getElementById("startExercisesBtn").addEventListener("click", () => {
      renderTrainingExercise();
    });
  }

  let restTimerInterval = null;

  function renderRestTimer() {
    clearInterval(restTimerInterval);
    setWorkoutProgress(currentExerciseIdx + 1, currentWorkoutQueue.length);
    const wrap = document.getElementById("trainingContent");
    const savedDuration = parseInt(localStorage.getItem("kg_rest_duration")) || 90;
    let remaining = savedDuration;

    wrap.innerHTML = `<div class="section-title">Pause</div>
      <div class="upcoming-wrap" style="text-align:center">
        <div class="sub" style="margin-bottom:8px">Nächste Übung: ${currentWorkoutQueue[currentExerciseIdx]?.name || ""}</div>
        <div id="restTimerDisplay" style="font-family:'Bebas Neue',sans-serif;font-size:64px;letter-spacing:2px;color:#9fe84a;margin:10px 0">${formatRestTime(remaining)}</div>
        <div class="dur-row" id="restDurRow" style="margin-bottom:14px">
          ${[30,60,90,120].map(s=>`<button class="btn-dur${s===savedDuration?" active":""}" data-sec="${s}">${s}s</button>`).join("")}
        </div>
        <button id="restPauseBtn" class="btn-main btn-dark" style="margin-bottom:8px">⏸ Pausieren</button>
        <button id="restSkipBtn" class="btn-main btn-lime">Überspringen →</button>
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
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
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
    const wrap = document.getElementById("trainingContent");
    if (!writeKey()) {
      wrap.innerHTML = requireLoginHtml();
      return;
    }
    if (currentExerciseIdx >= currentWorkoutQueue.length) {
      hideWorkoutProgress();
      const bodyList = [...completedBodies];
      const bodyNamesHTML = bodyList.length
        ? `<ul style="margin:10px 0 0;padding-left:18px;color:#ddd;line-height:1.6">${bodyList.map(b=>`<li>${BODY_LABELS[b]||b}</li>`).join("")}</ul>`
        : `<div class="sub" style="margin-top:8px">Keine Muskelgruppe erfasst.</div>`;
      if (!growthMvpInitialized && trainingUser) {
        updateGrowthMvpInitialized(true);
        await recordWorkoutCompletion(trainingUser, currentWorkoutQueue.length);
      }
      wrap.innerHTML = `<div class="section-title">Fertig! 🎉</div><div class="info-box">Workout abgeschlossen, ${currentWorkoutQueue.length} Übungen protokolliert.</div>
        <div class="upcoming-wrap" style="text-align:center">
          <div class="upcoming-title">Trainierte Muskelgruppen</div>
          ${renderMuscleSVG(bodyList)}
          ${bodyNamesHTML}
        </div>
        <button id="restartTrainingBtn" class="btn-main btn-dark" style="margin-top:16px">Neues Workout erstellen</button>`;
      document.getElementById("restartTrainingBtn").addEventListener("click", renderTrainingSetup);
      return;
    }
    updateGrowthMvpInitialized(false);
    setWorkoutProgress(currentExerciseIdx + 1, currentWorkoutQueue.length);
    const ex = currentWorkoutQueue[currentExerciseIdx];
    const overrides = await getExerciseOverrides();
    const display = getExerciseDisplay(ex, overrides);
    const mediaHTML = renderExerciseMediaHtml(ex, overrides, { compact: true });
    const instrHTML = display.steps.length ? `
        <button id="toggleInstrBtn" class="btn-main btn-dark" style="margin-top:10px;margin-bottom:0">📋 Anleitung anzeigen</button>
        <div id="instrBox" style="display:none;margin-top:10px;padding:12px;background:#0d0d0d;border-radius:8px">
          <ul style="margin:0;padding-left:18px;color:#ddd;line-height:1.6">
            ${display.steps.map(s => `<li>${s}</li>`).join("")}
          </ul>
          ${display.note ? `<div class="faq-note" style="margin-top:8px;color:#f5c542">${display.note}</div>` : ""}
        </div>` : "";
    const rackFieldHTML = ex.rackSetting ? `
        <div style="margin-top:12px">
          <div class="field-label">${ex.rackLabel || "Rack-Einstellung"} (Stufe)</div>
          <input type="number" step="1" id="logRackSetting" class="time-input" placeholder="z.B. 5">
        </div>` : "";
    wrap.innerHTML = `<div class="upcoming-wrap"><div class="upcoming-title">${BODY_LABELS[ex.body]}</div>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:1px;color:#fff;margin-bottom:10px">${display.name}</div>
        ${mediaHTML}
        <div class="sub" id="recoNote" style="color:#999;margin-bottom:14px">Lade letzten Wert…</div>
        <div class="field-label" style="margin-bottom:6px">Sätze</div>
        <div id="setsList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px"></div>
        <div class="time-grid">
          <div><div class="field-label">Gewicht (kg)</div><input type="number" step="0.5" id="logWeight" class="time-input" placeholder="z.B. 10"></div>
          <div><div class="field-label">Wiederholungen</div><input type="number" id="logReps" class="time-input" placeholder="z.B. 10"></div>
        </div>
        <div style="margin-top:10px">
          <div class="field-label">RIR (Wdh. bis Muskelversagen übrig)</div>
          <input type="number" min="0" max="5" id="logRir" class="time-input" placeholder="z.B. 2">
        </div>
        <button id="addSetBtn" class="btn-main btn-dark" style="margin-top:8px">+ Satz hinzufügen</button>
        <div class="time-grid" style="margin-top:12px">
          <div><div class="field-label">Ziel min. Wdh.</div><input type="number" id="logMin" class="time-input" placeholder="${ex.defMin}"></div>
          <div><div class="field-label">Ziel max. Wdh.</div><input type="number" id="logMax" class="time-input" placeholder="${ex.defMax}"></div>
        </div>
        ${rackFieldHTML}
        ${instrHTML}
        <button id="doneExBtn" class="btn-main btn-lime" style="margin-top:16px">Erledigt →</button>
        <button id="skipExBtn" class="btn-main btn-dark" style="margin-top:8px">Übung überspringen</button>
      </div>`;

    if (instrHTML) {
      document.getElementById("toggleInstrBtn").addEventListener("click", () => {
        const box = document.getElementById("instrBox");
        const btn = document.getElementById("toggleInstrBtn");
        const isHidden = box.style.display === "none";
        box.style.display = isHidden ? "block" : "none";
        btn.textContent = isHidden ? "📋 Anleitung ausblenden" : "📋 Anleitung anzeigen";
      });
    }

    initExerciseMediaFallbacks(wrap);

    currentSets = [];

    function renderSetsList() {
      const listEl = document.getElementById("setsList");
      if (!listEl) return;
      if (!currentSets.length) {
        listEl.innerHTML = `<div class="sub" style="color:#777">Noch keine Sätze hinzugefügt.</div>`;
        return;
      }
      listEl.innerHTML = currentSets.map((s, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:#0d0d0d;border-radius:8px;padding:8px 12px">
          <span style="color:#ddd">Satz ${i+1}: <strong style="color:#cdf94a">${s.reps}</strong> Wdh. bei <strong style="color:#cdf94a">${s.weight}</strong> kg${s.rir != null ? ` <span style="color:#999">(RIR ${s.rir})</span>` : ""}</span>
          <button data-idx="${i}" class="removeSetBtn" style="background:none;border:none;color:#f55;font-size:16px;cursor:pointer;padding:0 4px">✕</button>
        </div>`).join("");
      listEl.querySelectorAll(".removeSetBtn").forEach(btn => {
        btn.addEventListener("click", () => {
          currentSets.splice(parseInt(btn.dataset.idx), 1);
          renderSetsList();
        });
      });
    }
    renderSetsList();

    document.getElementById("addSetBtn").addEventListener("click", () => {
      const weight = parseFloat(document.getElementById("logWeight").value) || 0;
      const reps = parseInt(document.getElementById("logReps").value) || 0;
      const rirRaw = document.getElementById("logRir").value;
      const rir = rirRaw !== "" ? parseInt(rirRaw) : null;
      if (reps <= 0) {
        showToast("Bitte Wiederholungen für den Satz eingeben.", "error", 2200);
        return;
      }
      currentSets.push({ weight, reps, rir });
      renderSetsList();
      showToast(`Satz ${currentSets.length} hinzugefügt.`, "success", 1200);
    });

    // Buttons sofort aktivieren, nicht erst nach der Firebase-Abfrage des letzten Logs
    document.getElementById("doneExBtn").addEventListener("click", async () => {
      // Falls im letzten Feld noch ein Satz steht, der nicht per "+ Satz hinzufügen" gespeichert wurde, automatisch übernehmen
      const pendingWeight = parseFloat(document.getElementById("logWeight").value) || 0;
      const pendingReps = parseInt(document.getElementById("logReps").value) || 0;
      const pendingRirRaw = document.getElementById("logRir").value;
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
      // Durchschnitt aus allen Sätzen für die Grafik/Übersicht
      const avgWeight = Math.round((currentSets.reduce((sum, s) => sum + s.weight, 0) / currentSets.length) * 10) / 10;
      const avgReps = Math.round(currentSets.reduce((sum, s) => sum + s.reps, 0) / currentSets.length);
      const minReps = parseInt(document.getElementById("logMin").value) || ex.defMin;
      const maxReps = parseInt(document.getElementById("logMax").value) || ex.defMax;
      // RIR des letzten protokollierten Satzes – relevant für die nächste Gewichtsempfehlung
      const lastSetRir = currentSets[currentSets.length - 1]?.rir;
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
      try {
        await push(logRef(key, ex.id), logEntry);
        showToast(`Übung gespeichert (${currentSets.length} Sätze, Ø ${avgWeight} kg × ${avgReps} Wdh.).`, "success", 2200);
      } catch (err) {
        console.error("Speichern fehlgeschlagen (voller Eintrag):", err, logEntry);
        const { sets, ...fallbackEntry } = logEntry;
        try {
          await push(logRef(key, ex.id), fallbackEntry);
          showToast(`Übung gespeichert (Ø ${avgWeight} kg × ${avgReps} Wdh. – Satz-Details konnten wegen Datenbank-Einschränkung nicht gespeichert werden).`, "info", 4500);
        } catch (err2) {
          console.error("Speichern fehlgeschlagen (Fallback ohne sets):", err2, fallbackEntry);
          showToast("Speichern fehlgeschlagen: " + (err2 && err2.message ? err2.message : "Unbekannter Fehler") + ". Bitte Datenbank-Regeln in der Firebase-Konsole prüfen.", "error", 5000);
          return;
        }
      }
      completedBodies.add(ex.body);
      await saveLastWorkout(key, currentWorkoutQueue.slice(0, currentExerciseIdx + 1).map(e => e.id));
      currentExerciseIdx++;
      if (currentExerciseIdx >= currentWorkoutQueue.length) {
        await saveLastWorkout(key, currentWorkoutQueue.slice(0, currentExerciseIdx).map(e => e.id));
        renderTrainingExercise();
      } else {
        await refreshLastWorkoutBox();
        renderRestTimer();
      }
    });
    document.getElementById("skipExBtn").addEventListener("click", () => { currentExerciseIdx++; renderTrainingExercise(); });

    const last = await getLastLog(readKey() || writeKey(), ex.id);
    const reco = computeRecommendation(last, ex);
    document.getElementById("recoNote").innerHTML = reco.note + (reco.weight ? `<br><strong style="color:#cdf94a">Empfehlung: ${reco.weight} kg × ${reco.reps} Wdh.</strong>` : `<br><strong style="color:#cdf94a">Empfehlung: ${reco.reps} Wdh. (Gewicht selbst wählen)</strong>`);
    document.getElementById("logWeight").value = reco.weight || "";
    document.getElementById("logReps").value = reco.reps || "";
    document.getElementById("logMin").value = (last && last.minReps) || "";
    document.getElementById("logMax").value = (last && last.maxReps) || "";
    if (ex.rackSetting) {
      const rackInput = document.getElementById("logRackSetting");
      if (rackInput) rackInput.value = (last && last.rackSetting != null) ? last.rackSetting : "";
    }
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
    setSelectedDuration,
    getSelectedDuration
  };
}
