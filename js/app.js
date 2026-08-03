import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, set, get, remove, push } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCovESjJ-1UPTKGdv3tiggabIgJsPZpUJI",
  authDomain:        "kellerkraft-gym.firebaseapp.com",
  databaseURL:       "https://kellerkraft-gym-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "kellerkraft-gym",
  storageBucket:     "kellerkraft-gym.firebasestorage.app",
  messagingSenderId: "694797273142",
  appId:             "1:694797273142:web:1cbf492a8356ae554e7097"
};

const OWNER_PIN = "1234";

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
const auth = getAuth(app);

// Automatische anonyme Anmeldung, damit Firebase-Regeln mit "auth != null" erfüllt werden
signInAnonymously(auth).catch((err) => {
  console.error("Anonyme Anmeldung fehlgeschlagen:", err);
  showToast("Anmeldung fehlgeschlagen – Speichern könnte nicht funktionieren.", "error", 4000);
});
const statusRef   = ref(db, "gym/status");
const scheduleRef = ref(db, "gym/schedule");


/* ============ TOAST / FEHLERANZEIGE ============ */
function showToast(message, type = "info", duration = 3500) {
  const wrap = document.getElementById("toastWrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
  el.textContent = message;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, duration);
}
window.addEventListener("offline", () => showToast("Keine Internetverbindung – Änderungen werden ggf. nicht gespeichert.", "error", 5000));
window.addEventListener("online", () => showToast("Verbindung wiederhergestellt.", "success", 2500));

/* ============ THEME (Hell/Dunkel) ============ */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggleBtn");
  if (btn) btn.textContent = theme === "light" ? "☀️" : "🌙";
  localStorage.setItem("kg_theme", theme);
}
function initTheme() {
  const saved = localStorage.getItem("kg_theme") || "dark";
  applyTheme(saved);
  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(current);
    });
  }
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


const DAYS = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
const DAYS_SHORT = ["So","Mo","Di","Mi","Do","Fr","Sa"];

let currentStatus   = null;
let currentSchedule = {};
let isOwner = false;
let activeTab = "home";
let weekOffset = 0;
let selectedDayDetail = null;
let trainingUser = localStorage.getItem("kg_user") || "";
let pendingWorkoutStart = false;
let checkedInAs = "";

function checkinToTrainingDuration(min) {
  if (min >= 60) return 60;
  if (min >= 45) return 45;
  if (min >= 30) return 30;
  return 15;
}

function fmt(h, m) { return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }
function localDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function formatTime(ts) { return new Date(ts).toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" }); }
function minutesLeft(ts) { return Math.ceil((ts - Date.now()) / 60000); }
function progressPct(data) {
  const total = data.duration * 60000;
  const elapsed = Date.now() - (data.until - total);
  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

function getScheduleInfo() {
  const now = new Date();
  const dow = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let activeBlock = null;
  let upcomingBlocks = [];

  Object.entries(currentSchedule).forEach(([id, block]) => {
    const startMins = block.startH * 60 + block.startM;
    const endMins   = block.endH   * 60 + block.endM;

    if (block.recurring) {
      if (block.day === dow && nowMins >= startMins && nowMins < endMins) activeBlock = { ...block, id };
      else if (block.day === dow && nowMins < startMins) upcomingBlocks.push({ ...block, id, minsUntil: startMins - nowMins, sameDay: true });
      else if (block.day !== dow) { let diff = (block.day - dow + 7) % 7; upcomingBlocks.push({ ...block, id, daysUntil: diff, sameDay: false }); }
    } else {
      const blockDate = new Date(block.date + "T00:00:00");
      const todayDate = new Date(localDateStr(now) + "T00:00:00");
      const diffDays  = Math.round((blockDate - todayDate) / 86400000);
      if (diffDays === 0 && nowMins >= startMins && nowMins < endMins) activeBlock = { ...block, id };
      else if (diffDays === 0 && nowMins < startMins) upcomingBlocks.push({ ...block, id, minsUntil: startMins - nowMins, sameDay: true, diffDays: 0 });
      else if (diffDays > 0) upcomingBlocks.push({ ...block, id, daysUntil: diffDays, sameDay: false, diffDays });
    }
  });

  upcomingBlocks.sort((a,b) => {
    const aVal = a.sameDay ? (a.minsUntil||0) : (a.daysUntil||0)*1440;
    const bVal = b.sameDay ? (b.minsUntil||0) : (b.daysUntil||0)*1440;
    return aVal - bVal;
  });
  return { activeBlock, upcomingBlocks: upcomingBlocks.slice(0,3) };
}

function blockLabel(b) { return b.label || "Reserviert"; }
function blockTimeStr(b) { return `${fmt(b.startH,b.startM)} – ${fmt(b.endH,b.endM)} Uhr`; }
function blockWhenStr(b) {
  if (b.sameDay) { const h=Math.floor(b.minsUntil/60),m=b.minsUntil%60; return h===0?`in ${m} min`:m===0?`in ${h} Std`:`in ${h} Std ${m} min`; }
  const d = b.daysUntil||b.diffDays;
  return d===1?"morgen":b.recurring?DAYS[b.day]:`in ${d} Tagen`;
}

/* ================= WOCHENÜBERSICHT ================= */

function startOfWeek(offset) {
  const d = new Date();
  const dow = d.getDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diffToMonday + offset*7);
  d.setHours(0,0,0,0);
  return d;
}

function blocksForDate(dateObj) {
  const dow = dateObj.getDay();
  const dateStr = localDateStr(dateObj);
  const list = [];
  Object.entries(currentSchedule).forEach(([id, block]) => {
    if (block.recurring && block.day === dow) list.push({ ...block, id });
    else if (!block.recurring && block.date === dateStr) list.push({ ...block, id });
  });
  list.sort((a,b) => (a.startH*60+a.startM) - (b.startH*60+b.startM));
  return list;
}

function segmentCoverage(blocks) {
  const seg = { morning: false, afternoon: false, evening: false };
  blocks.forEach(b => {
    const s = b.startH*60+b.startM, e = b.endH*60+b.endM;
    if (s < 12*60 && e > 6*60) seg.morning = true;
    if (s < 18*60 && e > 12*60) seg.afternoon = true;
    if (s < 24*60 && e > 18*60) seg.evening = true;
  });
  return seg;
}

function renderWeekOverview() {
  const wk = startOfWeek(weekOffset);
  const today = new Date(); today.setHours(0,0,0,0);
  let rows = "";
  for (let i=0;i<7;i++) {
    const d = new Date(wk); d.setDate(wk.getDate()+i);
    const blocks = blocksForDate(d);
    const seg = segmentCoverage(blocks);
    const isToday = d.getTime() === today.getTime();
    const dateStr = localDateStr(d);
    rows += `<button class="week-row${isToday?" is-today":""}" data-date="${dateStr}">
      <div class="week-day">
        <span class="week-day-name">${DAYS_SHORT[d.getDay()]}</span>
        <span class="week-day-num">${d.getDate()}.${d.getMonth()+1}.</span>
      </div>
      <div class="week-bar">
        <div class="week-seg${seg.morning?" busy":""}"><span>Vormittag</span></div>
        <div class="week-seg${seg.afternoon?" busy":""}"><span>Nachmittag</span></div>
        <div class="week-seg${seg.evening?" busy":""}"><span>Abend</span></div>
      </div>
      <span class="week-chevron">›</span>
    </button>`;
  }
  const rangeLabel = `${wk.getDate()}.${wk.getMonth()+1}. – ${new Date(wk.getTime()+6*86400000).getDate()}.${new Date(wk.getTime()+6*86400000).getMonth()+1}.`;
  document.getElementById("weekOverview").innerHTML = `
    <div class="week-nav">
      <button class="week-nav-btn" id="weekPrev">‹</button>
      <span class="week-range">${rangeLabel}</span>
      <button class="week-nav-btn" id="weekNext">›</button>
    </div>
    <div class="week-legend">
      <span class="week-legend-spacer"></span>
      <div class="week-legend-bar">
        <span class="week-legend-item">Vormittag</span>
        <span class="week-legend-item">Nachmittag</span>
        <span class="week-legend-item">Abend</span>
      </div>
      <span class="week-legend-spacer"></span>
    </div>
    <div class="week-list">${rows}</div>
    <div class="week-color-key">
      <span><span class="week-color-key-swatch free"></span>Frei</span>
      <span><span class="week-color-key-swatch busy"></span>Reserviert</span>
    </div>`;

  document.getElementById("weekPrev")?.addEventListener("click", () => { weekOffset--; renderWeekOverview(); });
  document.getElementById("weekNext")?.addEventListener("click", () => { weekOffset++; renderWeekOverview(); });
  document.querySelectorAll(".week-row").forEach(btn => {
    btn.addEventListener("click", () => { selectedDayDetail = btn.dataset.date; renderDayDetail(); });
  });
}

function renderDayDetail() {
  const wrap = document.getElementById("dayDetailModal");
  if (!selectedDayDetail) { wrap.classList.remove("open"); wrap.innerHTML = ""; return; }
  const d = new Date(selectedDayDetail + "T00:00:00");
  const blocks = blocksForDate(d);
  const dateLabel = `${DAYS[d.getDay()]}, ${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`;
  const rows = blocks.length
    ? blocks.map(b => `<div class="detail-row">
        <div class="detail-time">${fmt(b.startH,b.startM)}–${fmt(b.endH,b.endM)}</div>
        <div class="detail-label">${blockLabel(b)}${b.recurring?' <span class="detail-tag">wöchentlich</span>':''}</div>
      </div>`).join("")
    : `<div class="detail-empty">Keine Reservierungen an diesem Tag – frei nutzbar.</div>`;
  wrap.innerHTML = `<div class="modal-backdrop"></div>
    <div class="modal-card">
      <div class="modal-title">${dateLabel}</div>
      <div class="detail-list">${rows}</div>
      <button class="btn-main btn-dark" id="closeDayDetail">Schließen</button>
    </div>`;
  wrap.classList.add("open");
  wrap.querySelector(".modal-backdrop").addEventListener("click", () => { selectedDayDetail = null; renderDayDetail(); });
  document.getElementById("closeDayDetail").addEventListener("click", () => { selectedDayDetail = null; renderDayDetail(); });
}

/* ================= STATUS / CHECK-IN (HOME) ================= */

function renderAll() {
  const isFreeCheckin = !currentStatus || currentStatus.until <= Date.now();
  const { activeBlock, upcomingBlocks } = getScheduleInfo();
  const effectivelyBusy = !isFreeCheckin || !!activeBlock;

  let cardHTML = "";
  if (!isFreeCheckin) {
    const pct = progressPct(currentStatus);
    cardHTML = `<div class="dot orange pulse">🏋️</div><div class="big-label orange">BELEGT</div><div class="sub">${currentStatus.name} trainiert gerade</div>
      <div class="bar-wrap"><div class="bar" id="bar" style="width:${pct}%"></div></div>
      <div class="time-row"><span class="label-small">Frei ab</span><span class="big-time">${formatTime(currentStatus.until)}</span></div>
      <div class="sub" id="remaining">noch ca. ${minutesLeft(currentStatus.until)} min</div>`;
  } else if (activeBlock) {
    cardHTML = `<div class="dot orange">📅</div><div class="big-label orange">BELEGT</div><div class="sub">${blockLabel(activeBlock)}</div>
      <div class="time-row" style="margin-top:16px"><span class="label-small">Frei ab</span><span class="big-time">${fmt(activeBlock.endH,activeBlock.endM)}</span></div>`;
  } else {
    cardHTML = `<div class="dot green">💪</div><div class="big-label lime">FREI</div><div class="sub">Gym ist verfügbar</div>`;
  }

  let upcomingHTML = "";
  if (upcomingBlocks.length > 0) {
    upcomingHTML = `<div class="upcoming-wrap"><div class="upcoming-title">DEMNÄCHST</div>
      ${upcomingBlocks.map(b=>`<div class="upcoming-row"><div>
        <div class="upcoming-when">${blockWhenStr(b)}${b.recurring?" · "+DAYS[b.day]:""}</div>
        <div class="upcoming-label">${blockLabel(b)} · ${blockTimeStr(b)}</div>
      </div>${isOwner?`<button class="del-btn" data-id="${b.id}">✕</button>`:""}</div>`).join("")}
    </div>`;
  }

  document.getElementById("card").innerHTML = cardHTML;
  document.getElementById("upcoming").innerHTML = upcomingHTML;

  let formHTML = "";
  if (!effectivelyBusy) {
    formHTML = `<input id="nameInput" class="name-input" placeholder="Dein Name (optional)" maxlength="20" value="${trainingUser.replace(/"/g, "&quot;")}">
      <div class="dur-row">
        <button class="btn-dur active" data-min="30">30 min</button>
        <button class="btn-dur" data-min="45">45 min</button>
        <button class="btn-dur" data-min="60">60 min</button>
        <button class="btn-dur" data-min="90">90 min</button>
      </div>
      <button id="checkinBtn" class="btn-main btn-lime">Ich bin drin →</button>`;
  } else if (!isFreeCheckin) {
    formHTML = `<button id="checkoutBtn" class="btn-main btn-dark">Fertig – Gym freigeben</button>`;
    if (pendingWorkoutStart && currentStatus.name === checkedInAs) {
      formHTML += `<button id="startWorkoutBtn" class="btn-main btn-lime" style="margin-top:10px">Workout starten →</button>`;
    }
  }

  if (isFreeCheckin) {
    pendingWorkoutStart = false;
    checkedInAs = "";
  }

  formHTML += `<div class="home-quick-nav">
      <button type="button" class="home-quick-btn" data-goto="training">Training</button>
      <button type="button" class="home-quick-btn" data-goto="ausstattung">Ausstattung</button>
    </div>`;

  document.getElementById("form").innerHTML = formHTML;

  attachHomeListeners();
  if (!isFreeCheckin) startLocalTick(currentStatus);
  renderWeekOverview();
}

let tickInterval = null;
function startLocalTick(data) {
  clearInterval(tickInterval);
  tickInterval = setInterval(() => {
    const rem = document.getElementById("remaining");
    const bar = document.getElementById("bar");
    if (rem) rem.textContent = `noch ca. ${minutesLeft(data.until)} min`;
    if (bar) bar.style.width = progressPct(data) + "%";
    if (data.until <= Date.now()) { clearInterval(tickInterval); renderAll(); }
  }, 30000);
}

function attachHomeListeners() {
  let selectedMin = 30;
  document.querySelectorAll(".btn-dur").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".btn-dur").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedMin = parseInt(btn.dataset.min);
    });
  });
  document.getElementById("checkinBtn")?.addEventListener("click", () => {
    const raw = document.getElementById("nameInput").value.trim();
    if (raw) {
      trainingUser = raw;
      localStorage.setItem("kg_user", raw);
    }
    const name = raw || "Jemand";
    checkedInAs = name;
    pendingWorkoutStart = true;
    selectedDuration = checkinToTrainingDuration(selectedMin);
    set(statusRef, { until: Date.now() + selectedMin * 60000, name, duration: selectedMin });
  });
  document.getElementById("startWorkoutBtn")?.addEventListener("click", () => {
    pendingWorkoutStart = false;
    switchTab("training");
  });
  document.getElementById("checkoutBtn")?.addEventListener("click", () => {
    pendingWorkoutStart = false;
    checkedInAs = "";
    remove(statusRef);
  });
  document.querySelectorAll(".home-quick-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });
  document.querySelectorAll(".del-btn").forEach(btn => {
    btn.addEventListener("click", () => remove(ref(db, "gym/schedule/" + btn.dataset.id)));
  });
}

/* ================= RESERVIEREN TAB ================= */

function renderReservePage() {
  const wrap = document.getElementById("reserveContent");
  const ownerLinkHTML = isOwner
    ? `<button class="owner-link" id="ownerLogout">Owner-Modus verlassen</button>`
    : `<button class="owner-link" id="ownerLogin">Owner-Modus (zum Löschen von Terminen)</button>`;

  const panelHTML = `<div class="owner-panel">
      <div class="owner-title">📅 NEUEN TERMIN EINTRAGEN</div>
      <input id="schedLabel" class="name-input" placeholder="Bezeichnung (z.B. Dein Name)" maxlength="30">
      <div class="time-grid">
        <div><div class="field-label">Von</div><input type="time" id="schedStart" class="time-input" value="16:00"></div>
        <div><div class="field-label">Bis</div><input type="time" id="schedEnd" class="time-input" value="17:00"></div>
      </div>
      <div class="recur-row"><label class="toggle-label"><input type="checkbox" id="schedRecur"> Wöchentlich wiederholen</label></div>
      <div id="schedDayWrap" class="day-picker" style="display:none">
        ${DAYS_SHORT.map((d,i)=>`<button class="day-btn${i===3?" active":""}" data-day="${i}">${d}</button>`).join("")}
      </div>
      <div id="schedDateWrap"><div class="field-label">Datum</div><input type="date" id="schedDate" class="time-input" value="${localDateStr(new Date())}"></div>
      <button id="addSchedBtn" class="btn-main btn-owner">+ Termin speichern</button>
    </div>`;

  let allBlocksHTML = "";
  const entries = Object.entries(currentSchedule);
  if (entries.length > 0) {
    const sorted = entries.sort((a,b) => {
      const av = a[1].recurring ? a[1].day*1440+a[1].startH*60+a[1].startM : new Date(a[1].date).getTime()/60000 + a[1].startH*60+a[1].startM;
      const bv = b[1].recurring ? b[1].day*1440+b[1].startH*60+b[1].startM : new Date(b[1].date).getTime()/60000 + b[1].startH*60+b[1].startM;
      return av - bv;
    });
    allBlocksHTML = `<div class="upcoming-wrap"><div class="upcoming-title">ALLE TERMINE</div>
      ${sorted.map(([id,b])=>`<div class="upcoming-row"><div>
        <div class="upcoming-when">${b.recurring ? "jeden "+DAYS[b.day] : new Date(b.date+"T00:00:00").toLocaleDateString("de-DE",{weekday:"short",day:"2-digit",month:"2-digit"})}</div>
        <div class="upcoming-label">${blockLabel(b)} · ${blockTimeStr(b)}</div>
      </div>${isOwner?`<button class="del-btn" data-id="${id}">✕</button>`:""}</div>`).join("")}
    </div>`;
  }

  const dbOverviewPlaceholder = isOwner ? `<div class="section-title" style="margin-top:20px">🗄️ Datenbank-Übersicht (Owner)</div><div id="dbOverviewBox" class="info-box">Lade…</div>` : "";

  const formSection = `
    <div class="section-title"${entries.length === 0 ? "" : ' style="margin-top:20px"'}>Vorab reservieren</div>
    ${panelHTML}
    <div style="text-align:center;margin-top:16px">${ownerLinkHTML}</div>
  `;

  // Empty: form first so first booking isn't buried under an empty list
  wrap.innerHTML = entries.length === 0
    ? `${formSection}${dbOverviewPlaceholder}`
    : `<div class="section-title">Terminübersicht</div>${allBlocksHTML}${formSection}${dbOverviewPlaceholder}`;

  if (isOwner) renderDbOverview();

  document.getElementById("ownerLogin")?.addEventListener("click", () => {
    const pin = prompt("Owner PIN:");
    if (pin === OWNER_PIN) { isOwner = true; renderReservePage(); } else alert("Falscher PIN.");
  });
  document.getElementById("ownerLogout")?.addEventListener("click", () => { isOwner = false; renderReservePage(); });
  document.querySelectorAll(".del-btn").forEach(btn => {
    btn.addEventListener("click", () => remove(ref(db, "gym/schedule/" + btn.dataset.id)));
  });

  const recurCb = document.getElementById("schedRecur");
  recurCb?.addEventListener("change", () => {
    document.getElementById("schedDayWrap").style.display = recurCb.checked ? "flex" : "none";
    document.getElementById("schedDateWrap").style.display = recurCb.checked ? "none" : "block";
  });
  let selectedDay = 3;
  document.querySelectorAll(".day-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".day-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedDay = parseInt(btn.dataset.day);
    });
  });
  document.getElementById("addSchedBtn")?.addEventListener("click", () => {
    const label = document.getElementById("schedLabel").value.trim() || "Reserviert";
    const start = document.getElementById("schedStart").value.split(":").map(Number);
    const end   = document.getElementById("schedEnd").value.split(":").map(Number);
    const recur = document.getElementById("schedRecur").checked;
    const date  = document.getElementById("schedDate")?.value;
    if (start[0]*60+start[1] >= end[0]*60+end[1]) { alert("Endzeit muss nach Startzeit liegen."); return; }
    const entry = { label, startH: start[0], startM: start[1], endH: end[0], endM: end[1], recurring: recur };
    if (recur) entry.day = selectedDay; else entry.date = date;
    push(scheduleRef, entry);
    document.getElementById("schedLabel").value = "";
  });
}

/* ================= TAB NAVIGATION ================= */


/* ================= ÜBUNGSDATENBANK ================= */

import { EXERCISE_INSTRUCTIONS, EXERCISES, BODY_LABELS, LEVEL_LABELS, LEVEL_ORDER, LEVEL_DESC } from "./data.js";

function levelsUpTo(level) {
  const idx = LEVEL_ORDER.indexOf(level);
  return LEVEL_ORDER.slice(0, idx + 1);
}

/* ================= ÜBUNGEN-SEITE (dynamisch, mit Bearbeitung) ================= */

function exerciseOverrideRef(exId) { return ref(db, `gym/exerciseOverrides/${exId}`); }

let customExercises = {}; // id -> exercise object from Firebase (custom: true)

async function loadCustomExercises() {
  try {
    const snap = await get(ref(db, "gym/exerciseOverrides"));
    const all = snap.val() || {};
    customExercises = {};
    Object.entries(all).forEach(([id, val]) => {
      if (val && val.custom && val.body) {
        customExercises[id] = {
          id,
          name: val.name,
          body: val.body,
          level: val.level || "easy",
          defMin: val.defMin ?? 8,
          defMax: val.defMax ?? 12,
          equip: val.equip || ["custom"],
          steps: val.steps || [],
          note: val.note || null,
          rackSetting: !!val.rackSetting,
          rackLabel: val.rackLabel || null,
          custom: true
        };
      }
    });
  } catch (err) {
    customExercises = {};
    showToast("Eigene Übungen konnten nicht geladen werden.", "error");
  }
  return customExercises;
}

async function getExerciseOverrides() {
  try {
    const snap = await get(ref(db, "gym/exerciseOverrides"));
    return snap.val() || {};
  } catch (err) {
    showToast("Übungs-Änderungen konnten nicht geladen werden.", "error");
    return {};
  }
}

async function saveExerciseOverride(exId, override) {
  try {
    await set(exerciseOverrideRef(exId), override);
    showToast("Übung aktualisiert.", "success", 2000);
    return true;
  } catch (err) {
    showToast("Speichern fehlgeschlagen.", "error");
    return false;
  }
}

async function saveCustomExercise(ex) {
  try {
    const payload = {
      custom: true,
      name: ex.name,
      body: ex.body,
      level: ex.level,
      defMin: ex.defMin,
      defMax: ex.defMax,
      equip: ex.equip || ["custom"],
      steps: ex.steps || [],
      note: ex.note || null
    };
    await set(exerciseOverrideRef(ex.id), payload);
    customExercises[ex.id] = { id: ex.id, ...payload };
    showToast("Übung hinzugefügt.", "success", 2000);
    return true;
  } catch (err) {
    showToast("Speichern fehlgeschlagen.", "error");
    return false;
  }
}

async function deleteCustomExercise(exId) {
  try {
    await remove(exerciseOverrideRef(exId));
    delete customExercises[exId];
    showToast("Übung gelöscht.", "success", 2000);
    return true;
  } catch (err) {
    showToast("Löschen fehlgeschlagen.", "error");
    return false;
  }
}

function getAllExercises() {
  const staticIds = new Set(EXERCISES.map(e => e.id));
  const customs = Object.values(customExercises).filter(e => e && e.id && !staticIds.has(e.id));
  return [...EXERCISES, ...customs];
}

function findExercise(id) {
  return getAllExercises().find(e => e.id === id) || null;
}

function getExerciseDisplay(ex, overrides) {
  const o = overrides[ex.id] || {};
  const baseInstr = EXERCISE_INSTRUCTIONS[ex.id] || { steps: ex.steps || [], note: ex.note || null };
  return {
    name: o.name || ex.name,
    steps: o.steps || baseInstr.steps || [],
    note: (o.note !== undefined) ? o.note : baseInstr.note
  };
}

function slugifyExerciseId(name) {
  const base = name.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 36);
  let id = base || ("custom" + Date.now());
  const taken = new Set(getAllExercises().map(e => e.id));
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(id + n)) n++;
  return id + n;
}

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

const BODY_ICONS = { beine: "🍑", bauch: "🧘", ruecken: "🫁", arme: "💪", brust: "🫁" };
const BODY_ORDER = ["beine", "bauch", "ruecken", "arme", "brust"];

function renderAddExerciseForm(body) {
  return `
    <div class="owner-panel add-exercise-panel" style="margin-top:12px">
      <div class="owner-title">Neue Übung · ${BODY_LABELS[body] || body}</div>
      <input class="name-input" id="addName-${body}" placeholder="Name der Übung" maxlength="60">
      <div class="field-label" style="margin-top:8px">Level</div>
      <div class="chip-row" id="addLevel-${body}">
        ${LEVEL_ORDER.map((k,i)=>`<button type="button" class="chip add-level-chip${i===0?" active":""}" data-body="${body}" data-level="${k}">${LEVEL_LABELS[k]}</button>`).join("")}
      </div>
      <textarea class="name-input" id="addSteps-${body}" rows="4" style="margin-top:8px; resize:vertical;" placeholder="Anleitung – ein Schritt pro Zeile"></textarea>
      <input class="name-input" id="addNote-${body}" style="margin-top:8px;" placeholder="Hinweis (optional)" maxlength="200">
      <div class="time-grid" style="margin-top:8px">
        <div><div class="field-label">Min. Wdh</div><input type="number" class="time-input" id="addMin-${body}" value="8" min="1" max="50"></div>
        <div><div class="field-label">Max. Wdh</div><input type="number" class="time-input" id="addMax-${body}" value="12" min="1" max="50"></div>
      </div>
      <button type="button" class="btn-main btn-owner save-new-exercise-btn" data-body="${body}">+ Übung speichern</button>
    </div>`;
}

async function renderUebungenPage() {
  const wrap = document.getElementById("uebungenDynamicWrap");
  if (!wrap) return;
  await loadCustomExercises();
  const overrides = await getExerciseOverrides();
  const groups = {};
  BODY_ORDER.forEach(b => { groups[b] = []; });
  getAllExercises().forEach(e => { (groups[e.body] = groups[e.body] || []).push(e); });

  const ownerBar = isOwner
    ? `<div style="text-align:center;margin-bottom:14px"><button class="owner-link" id="uebungenOwnerLogout">Owner-Modus verlassen</button></div>`
    : `<div style="text-align:center;margin-bottom:14px"><button class="owner-link" id="uebungenOwnerLogin">Owner-Modus (Übungen hinzufügen)</button></div>`;

  wrap.innerHTML = ownerBar + BODY_ORDER.map(body => `
    <div class="faq-section">
      <button class="faq-section-btn">
        <span class="faq-section-icon">${BODY_ICONS[body] || "🏋️"}</span>
        <span class="faq-section-label">${BODY_LABELS[body] || body}</span>
        <span class="faq-section-chevron">▾</span>
      </button>
      <div class="faq-section-body"><div class="faq-section-inner">
        ${(groups[body] || []).map(ex => {
          const d = getExerciseDisplay(ex, overrides);
          const isCustom = !!customExercises[ex.id];
          return `
          <div class="faq-item" data-exid="${ex.id}">
            <button class="faq-question">${d.name}${isCustom ? ' <span class="detail-tag">eigen</span>' : ""} <span class="faq-chevron">▾</span></button>
            <div class="faq-answer"><div class="faq-answer-inner">
              <ul>
                ${d.steps.map(s => `<li>${s}</li>`).join("")}
              </ul>
              ${d.note ? `<div class="faq-note">${d.note}</div>` : ""}
              ${isOwner ? `
              <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                <button class="btn-main btn-dark edit-exercise-btn" data-exid="${ex.id}" style="width:100%">✏️ Info bearbeiten</button>
                ${isCustom ? `<button class="btn-main btn-dark delete-custom-exercise-btn" data-exid="${ex.id}" style="width:100%">🗑 Übung löschen</button>` : ""}
              </div>
              <div class="exercise-edit-form" id="editForm-${ex.id}" style="display:none; margin-top:12px;"></div>
              ` : ""}
            </div></div>
          </div>
        `; }).join("") || `<div class="info-box">Noch keine Übungen in dieser Zone.</div>`}
        ${isOwner ? `
          <button type="button" class="btn-main btn-owner toggle-add-exercise-btn" data-body="${body}" style="margin-top:10px">+ Übung hinzufügen</button>
          <div id="addFormWrap-${body}" style="display:none">${renderAddExerciseForm(body)}</div>
        ` : ""}
      </div></div>
    </div>
  `).join("");

  document.getElementById("uebungenOwnerLogin")?.addEventListener("click", () => {
    const pin = prompt("Owner PIN:");
    if (pin === OWNER_PIN) { isOwner = true; renderUebungenPage(); }
    else if (pin != null) alert("Falscher PIN.");
  });
  document.getElementById("uebungenOwnerLogout")?.addEventListener("click", () => {
    isOwner = false;
    renderUebungenPage();
  });

  wrap.querySelectorAll(".faq-section-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const section = btn.parentElement;
      const isOpen = section.classList.contains("open");
      section.parentElement.querySelectorAll(".faq-section").forEach(s => s.classList.remove("open"));
      if (!isOpen) section.classList.add("open");
    });
  });
  wrap.querySelectorAll(".faq-question").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const isOpen = item.classList.contains("open");
      item.closest(".faq-section-inner").querySelectorAll(".faq-item").forEach(i => i.classList.remove("open"));
      if (!isOpen) item.classList.add("open");
    });
  });

  wrap.querySelectorAll(".toggle-add-exercise-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const body = btn.dataset.body;
      const formWrap = document.getElementById(`addFormWrap-${body}`);
      const open = formWrap.style.display !== "none";
      formWrap.style.display = open ? "none" : "block";
      btn.textContent = open ? "+ Übung hinzufügen" : "Abbrechen";
    });
  });

  wrap.querySelectorAll(".add-level-chip").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const body = btn.dataset.body;
      document.querySelectorAll(`#addLevel-${body} .add-level-chip`).forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  wrap.querySelectorAll(".save-new-exercise-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const body = btn.dataset.body;
      const name = document.getElementById(`addName-${body}`).value.trim();
      const stepsRaw = document.getElementById(`addSteps-${body}`).value;
      const note = document.getElementById(`addNote-${body}`).value.trim();
      const levelBtn = document.querySelector(`#addLevel-${body} .add-level-chip.active`);
      const level = levelBtn?.dataset.level || "easy";
      const defMin = parseInt(document.getElementById(`addMin-${body}`).value, 10) || 8;
      const defMax = parseInt(document.getElementById(`addMax-${body}`).value, 10) || 12;
      const steps = stepsRaw.split("\n").map(s => s.trim()).filter(Boolean);
      if (!name) { alert("Bitte einen Namen angeben."); return; }
      if (steps.length === 0) { alert("Bitte mindestens einen Anleitungsschritt angeben."); return; }
      if (defMin > defMax) { alert("Min. Wiederholungen dürfen nicht größer als Max. sein."); return; }
      const id = slugifyExerciseId(name);
      const ex = {
        id, name, body, level, defMin, defMax,
        equip: ["custom"],
        steps, note: note || null,
        custom: true
      };
      const ok = await saveCustomExercise(ex);
      if (ok) renderUebungenPage();
    });
  });

  wrap.querySelectorAll(".delete-custom-exercise-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Diese Übung wirklich löschen?")) return;
      const ok = await deleteCustomExercise(btn.dataset.exid);
      if (ok) renderUebungenPage();
    });
  });

  wrap.querySelectorAll(".edit-exercise-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const exId = btn.dataset.exid;
      const ex = findExercise(exId);
      if (!ex) return;
      const d = getExerciseDisplay(ex, overrides);
      const form = document.getElementById(`editForm-${exId}`);
      const isOpen = form.style.display !== "none";
      if (isOpen) { form.style.display = "none"; form.innerHTML = ""; return; }
      form.style.display = "block";
      form.innerHTML = `
        <input class="name-input" id="editName-${exId}" placeholder="Name" value="${escapeAttr(d.name)}">
        <textarea class="name-input" id="editSteps-${exId}" rows="5" style="margin-top:8px; resize:vertical;" placeholder="Ein Schritt pro Zeile">${d.steps.join("\n")}</textarea>
        <input class="name-input" id="editNote-${exId}" style="margin-top:8px;" placeholder="Hinweis (optional)" value="${escapeAttr(d.note || "")}">
        <button class="btn-main btn-lime save-exercise-edit-btn" data-exid="${exId}" style="width:100%; margin-top:10px;">💾 Speichern</button>
      `;
      form.querySelector(".save-exercise-edit-btn").addEventListener("click", async () => {
        const name = document.getElementById(`editName-${exId}`).value.trim();
        const stepsRaw = document.getElementById(`editSteps-${exId}`).value;
        const note = document.getElementById(`editNote-${exId}`).value.trim();
        const steps = stepsRaw.split("\n").map(s => s.trim()).filter(Boolean);
        if (!name || steps.length === 0) { alert("Bitte Name und mindestens einen Schritt angeben."); return; }
        if (customExercises[exId]) {
          const updated = { ...customExercises[exId], name, steps, note: note || null };
          await saveCustomExercise(updated);
        } else {
          await saveExerciseOverride(exId, { name, steps, note: note || null });
        }
        renderUebungenPage();
      });
    });
  });
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

function logRef(user, exId) { return ref(db, `gym/logs/${user}/${exId}`); }
function lastWorkoutRef(user) { return ref(db, `gym/lastWorkout/${user}`); }
function allLogsRef() { return ref(db, "gym/logs"); }

function getLastLog(user, exId) {
  return get(logRef(user, exId)).then(snap => {
    const val = snap.val();
    if (!val) return null;
    const entries = Object.values(val);
    entries.sort((a,b) => b.date - a.date);
    return entries[0] || null;
  }).catch(() => { showToast("Letzter Wert konnte nicht geladen werden.", "error"); return null; });
}

function getUserHistory(user) {
  return get(logRef(user, "")).catch(()=>null); // placeholder unused
}

async function getFullUserHistory(user) {
  const snap = await get(ref(db, `gym/logs/${user}`));
  const data = snap.val() || {};
  const result = {};
  Object.entries(data).forEach(([exId, entries]) => {
    const list = Object.entries(entries).map(([key, val]) => ({ ...val, _key: key })).sort((a,b)=>b.date-a.date);
    result[exId] = list;
  });
  return result;
}

async function updateLogEntry(user, exId, key, updates) {
  try {
    await set(ref(db, `gym/logs/${user}/${exId}/${key}`), updates);
    showToast("Eintrag aktualisiert.", "success", 2000);
    return true;
  } catch (err) {
    showToast("Aktualisierung fehlgeschlagen.", "error");
    return false;
  }
}

async function deleteLogEntry(user, exId, key) {
  try {
    await remove(ref(db, `gym/logs/${user}/${exId}/${key}`));
    showToast("Eintrag gelöscht.", "success", 2000);
    return true;
  } catch (err) {
    showToast("Löschen fehlgeschlagen.", "error");
    return false;
  }
}

async function getAllUsers() {
  try {
    const logsSnap = await get(allLogsRef());
    const logsUsers = Object.keys(logsSnap.val() || {});
    const lwSnap = await get(ref(db, "gym/lastWorkout"));
    const lwUsers = Object.keys(lwSnap.val() || {});
    return [...new Set([...logsUsers, ...lwUsers])].sort();
  } catch (err) {
    showToast("Nutzerliste konnte nicht geladen werden. Prüfe deine Verbindung.", "error");
    return [];
  }
}

async function saveLastWorkout(user, exerciseIds) {
  try {
    await set(lastWorkoutRef(user), { date: Date.now(), duration: selectedDuration, body: [...selectedBody], level: selectedLevel, exerciseIds });
  } catch (err) {
    showToast("Workout konnte nicht gespeichert werden.", "error");
  }
}

async function getLastWorkout(user) {
  const snap = await get(lastWorkoutRef(user));
  return snap.val();
}

/* ================= EIGENE WORKOUT-VORLAGEN (CUSTOM WORKOUTS) ================= */

function customWorkoutsRef(user) { return ref(db, `gym/customWorkouts/${user}`); }
function customWorkoutRef(user, id) { return ref(db, `gym/customWorkouts/${user}/${id}`); }

let manualSelectedExerciseIds = new Set();

async function getCustomWorkouts(user) {
  try {
    const snap = await get(customWorkoutsRef(user));
    const data = snap.val() || {};
    return Object.entries(data)
      .map(([id, w]) => ({ id, ...w }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } catch (err) {
    showToast("Eigene Workouts konnten nicht geladen werden.", "error");
    return [];
  }
}

async function saveCustomWorkout(user, name, exerciseIds) {
  try {
    const id = push(customWorkoutsRef(user)).key;
    await set(customWorkoutRef(user, id), { name, exerciseIds, createdAt: Date.now() });
    showToast(`Workout "${name}" gespeichert.`, "success");
    return id;
  } catch (err) {
    showToast("Workout konnte nicht gespeichert werden.", "error");
    return null;
  }
}

async function deleteCustomWorkout(user, id) {
  try {
    await remove(customWorkoutRef(user, id));
    showToast("Workout gelöscht.", "success", 2000);
    return true;
  } catch (err) {
    showToast("Löschen fehlgeschlagen.", "error");
    return false;
  }
}

function renderExercisePickerList(container) {
  const groups = {};
  getAllExercises().forEach(e => { (groups[e.body] = groups[e.body] || []).push(e); });
  container.innerHTML = Object.entries(groups).map(([body, list]) => `
    <div class="section-title" style="margin-top:16px; font-size:0.95em;">${BODY_LABELS[body] || body}</div>
    ${list.map(e => `
      <label class="chip" style="display:flex; align-items:center; gap:8px; width:100%; text-align:left; padding:10px 12px; margin-bottom:6px; cursor:pointer;">
        <input type="checkbox" class="manual-ex-checkbox" data-exid="${e.id}" ${manualSelectedExerciseIds.has(e.id) ? "checked" : ""} style="width:auto;">
        <span>${e.name}</span>
      </label>
    `).join("")}
  `).join("");
  container.querySelectorAll(".manual-ex-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) manualSelectedExerciseIds.add(cb.dataset.exid);
      else manualSelectedExerciseIds.delete(cb.dataset.exid);
    });
  });
}

async function renderCustomWorkoutsSection() {
  const wrap = document.getElementById("customWorkoutsSection");
  if (!wrap) return;
  if (!trainingUser) {
    wrap.innerHTML = `<div class="info-box" style="margin-top:16px">Bitte zuerst oben deinen Namen eingeben, um eigene Workouts zu erstellen und zu speichern.</div>`;
    return;
  }
  const saved = await getCustomWorkouts(trainingUser);
  wrap.innerHTML = `
    <div class="section-title" style="margin-top:24px">Eigene Workouts</div>
    ${saved.length ? `<div class="faq-wrap" style="margin-bottom:12px">${saved.map(w => `
      <div class="faq-item" data-workoutid="${w.id}">
        <button class="faq-question">${w.name} <span style="opacity:0.6; font-size:0.85em">(${(w.exerciseIds || []).length} Übungen)</span> <span class="faq-chevron">▾</span></button>
        <div class="faq-answer"><div class="faq-answer-inner">
          <ul>
            ${(w.exerciseIds || []).map(id => { const ex = findExercise(id); return `<li>${ex ? ex.name : id}</li>`; }).join("")}
          </ul>
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
      await deleteCustomWorkout(trainingUser, btn.dataset.workoutid);
      renderCustomWorkoutsSection();
    });
  });
  document.getElementById("createManualWorkoutBtn").addEventListener("click", () => {
    manualSelectedExerciseIds = new Set();
    renderManualWorkoutBuilder();
  });
}

function renderManualWorkoutBuilder() {
  const builder = document.getElementById("manualWorkoutBuilder");
  if (!builder) return;
  builder.innerHTML = `
    <div class="section-title" style="margin-top:20px">Übungen auswählen</div>
    <div id="manualExercisePickerList"></div>
    <input id="manualWorkoutNameInput" class="name-input" style="margin-top:16px" placeholder="Workout-Name, z. B. Leg Day A" maxlength="30">
    <div style="display:flex; gap:10px; margin-top:14px;">
      <button id="saveManualWorkoutBtn" class="btn-main btn-lime" style="flex:1;">💾 Speichern</button>
      <button id="cancelManualWorkoutBtn" class="btn-main btn-dark" style="flex:1;">Abbrechen</button>
    </div>
  `;
  renderExercisePickerList(document.getElementById("manualExercisePickerList"));
  document.getElementById("saveManualWorkoutBtn").addEventListener("click", async () => {
    const name = document.getElementById("manualWorkoutNameInput").value.trim();
    if (!name) { alert("Bitte einen Namen für das Workout eingeben."); return; }
    if (manualSelectedExerciseIds.size === 0) { alert("Bitte mindestens eine Übung auswählen."); return; }
    await saveCustomWorkout(trainingUser, name, [...manualSelectedExerciseIds]);
    manualSelectedExerciseIds = new Set();
    renderCustomWorkoutsSection();
  });
  document.getElementById("cancelManualWorkoutBtn").addEventListener("click", () => {
    manualSelectedExerciseIds = new Set();
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
  const wrap = document.getElementById("trainingContent");
  await loadCustomExercises();
  const allUsers = await getAllUsers();
  const profileChipsHTML = allUsers.length
    ? `<div class="chip-row" style="margin-bottom:10px">${allUsers.map(u=>`<button class="chip profile-chip${u===trainingUser?" active":""}" data-user="${u}">${u}</button>`).join("")}</div>`
    : "";

  wrap.innerHTML = `
    <div class="section-title">Wer trainiert?</div>
    ${profileChipsHTML}
    <input id="userNameInput" class="name-input" placeholder="Dein Name" maxlength="20" value="${trainingUser}">
    <div id="lastWorkoutBox"></div>
    <div style="text-align:center;margin-top:10px"><button id="viewHistoryBtn" class="owner-link">📊 Meine bisherigen Übungen ansehen</button></div>

    <div class="section-title" style="margin-top:20px">Dauer</div>
    <div class="dur-row" id="trainDurRow">
      ${[15,30,45,60].map(m=>`<button class="btn-dur${m===selectedDuration?" active":""}" data-min="${m}">${m} min</button>`).join("")}
    </div>

    <div class="section-title" style="margin-top:20px">Körperbereich</div>
    <div class="chip-row" id="bodyChips">
      ${Object.entries(BODY_LABELS).map(([k,l])=>`<button class="chip${selectedBody.has(k)?" active":""}" data-body="${k}">${l}</button>`).join("")}
    </div>

    <div class="section-title" style="margin-top:20px">Level</div>
    <div class="chip-row" id="levelChips" style="flex-direction:column; gap:8px; display:flex;">
      ${LEVEL_ORDER.map(k=>`<button class="chip level-chip${selectedLevel===k?" active":""}" data-level="${k}" style="width:100%; text-align:left; padding:12px 14px;">
        <strong>${LEVEL_LABELS[k]}</strong><br><span style="font-size:0.85em; opacity:0.75;">${LEVEL_DESC[k]}</span>
      </button>`).join("")}
    </div>

    <button id="startTrainingBtn" class="btn-main btn-lime" style="margin-top:24px">Workout erstellen →</button>
    <div id="customWorkoutsSection"></div>
  `;

  document.getElementById("userNameInput").addEventListener("input", e => { trainingUser = e.target.value.trim(); localStorage.setItem("kg_user", trainingUser); refreshLastWorkoutBox(); renderCustomWorkoutsSection(); });
  document.querySelectorAll(".profile-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      trainingUser = btn.dataset.user;
      localStorage.setItem("kg_user", trainingUser);
      renderTrainingSetup();
    });
  });
  document.querySelectorAll("#trainDurRow .btn-dur").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#trainDurRow .btn-dur").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      selectedDuration = parseInt(btn.dataset.min);
    });
  });
  document.querySelectorAll("#bodyChips .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.body;
      if (selectedBody.has(k)) { selectedBody.delete(k); btn.classList.remove("active"); }
      else { selectedBody.add(k); btn.classList.add("active"); }
    });
  });
  document.querySelectorAll("#levelChips .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedLevel = btn.dataset.level;
      document.querySelectorAll("#levelChips .chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });
  document.getElementById("startTrainingBtn").addEventListener("click", () => {
    if (!trainingUser) { alert("Bitte Namen eingeben."); return; }
    if (selectedBody.size === 0 || !selectedLevel) { alert("Bitte mindestens einen Körperbereich und ein Level wählen."); return; }
    currentWorkoutQueue = buildWorkout();
    currentExerciseIdx = 0;
    completedBodies = new Set();
    renderWarmup();
  });
  document.getElementById("viewHistoryBtn").addEventListener("click", () => {
    if (!trainingUser) { alert("Bitte zuerst einen Namen eingeben."); return; }
    renderUserHistory(trainingUser);
  });
  refreshLastWorkoutBox();
  renderCustomWorkoutsSection();
}

async function refreshLastWorkoutBox() {
  const box = document.getElementById("lastWorkoutBox");
  if (!box) return;
  if (!trainingUser) { box.innerHTML = ""; return; }
  const lw = await getLastWorkout(trainingUser);
  if (!lw) { box.innerHTML = ""; return; }
  const dateStr = new Date(lw.date).toLocaleDateString("de-DE", { weekday:"short", day:"2-digit", month:"2-digit" });
  box.innerHTML = `<div class="info-box" style="margin-top:12px">Letztes Workout (${dateStr}, ${lw.duration} Min, ${lw.exerciseIds.length} Übungen).
    <button id="repeatWorkoutBtn" class="btn-main btn-dark" style="margin-top:10px">🔁 Gleiches Workout wiederholen</button></div>`;
  document.getElementById("repeatWorkoutBtn").addEventListener("click", () => {
    currentWorkoutQueue = lw.exerciseIds.map(id => findExercise(id)).filter(Boolean);
    if (currentWorkoutQueue.length === 0) { alert("Übungen aus diesem Workout nicht mehr verfügbar."); return; }
    currentExerciseIdx = 0;
    renderTrainingExercise();
  });
}


async function renderDbOverview() {
  const box = document.getElementById("dbOverviewBox");
  if (!box) return;
  const snap = await get(allLogsRef());
  const data = snap.val() || {};
  const users = Object.keys(data);
  if (users.length === 0) { box.innerHTML = "Noch keine Trainingsdaten in der Datenbank."; return; }

  let html = `<div style="text-align:left">`;
  users.forEach(user => {
    const exercises = data[user] || {};
    const exCount = Object.keys(exercises).length;
    let entryCount = 0;
    Object.values(exercises).forEach(entries => entryCount += Object.keys(entries).length);
    html += `<div class="db-user-row">
      <div><strong style="color:#cdf94a">${user}</strong> — ${exCount} Übungen, ${entryCount} Einträge insgesamt</div>
      <div style="margin-top:6px">
        <button class="btn-main btn-dark db-view-btn" data-user="${user}" style="width:auto;padding:8px 14px;font-size:12px;display:inline-block;margin-right:8px">Details ansehen</button>
        <button class="btn-main db-del-user-btn" data-user="${user}" style="width:auto;padding:8px 14px;font-size:12px;display:inline-block;background:#3a1414;color:#ff8a8a;border:1px solid #5a1f1f">Alle Daten löschen</button>
      </div>
      <div class="db-detail" id="dbDetail-${user}" style="display:none;margin-top:10px"></div>
    </div>`;
  });
  html += `</div>`;
  box.innerHTML = html;

  document.querySelectorAll(".db-view-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = btn.dataset.user;
      const detailDiv = document.getElementById(`dbDetail-${user}`);
      if (detailDiv.style.display === "block") { detailDiv.style.display = "none"; return; }
      const history = await getFullUserHistory(user);
      let detailHTML = "";
      Object.entries(history).forEach(([exId, entries]) => {
        const exName = entries[0]?.exerciseName || exId;
        detailHTML += `<div style="margin-top:8px;padding:8px;background:#0d0d0d;border-radius:8px">
          <div style="color:#ddd;font-size:13px;margin-bottom:4px">${exName}</div>`;
        entries.slice(0,5).forEach(e => {
          const d = new Date(e.date).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"2-digit"});
          detailHTML += `<div style="font-size:12px;color:#888">${d}: ${e.weight} kg × ${e.reps} Wdh.</div>`;
        });
        detailHTML += `</div>`;
      });
      detailDiv.innerHTML = detailHTML || "Keine Einträge.";
      detailDiv.style.display = "block";
    });
  });

  document.querySelectorAll(".db-del-user-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const user = btn.dataset.user;
      if (!confirm(`Wirklich ALLE Trainingsdaten von "${user}" unwiderruflich löschen?`)) return;
      await remove(ref(db, `gym/logs/${user}`));
      await remove(ref(db, `gym/lastWorkout/${user}`));
      renderDbOverview();
    });
  });
}

async function renderUserHistory(user) {
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
  if (currentExerciseIdx >= currentWorkoutQueue.length) {
    const bodyList = [...completedBodies];
    const bodyNamesHTML = bodyList.length
      ? `<ul style="margin:10px 0 0;padding-left:18px;color:#ddd;line-height:1.6">${bodyList.map(b=>`<li>${BODY_LABELS[b]||b}</li>`).join("")}</ul>`
      : `<div class="sub" style="margin-top:8px">Keine Muskelgruppe erfasst.</div>`;
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
  const ex = currentWorkoutQueue[currentExerciseIdx];
  const display = getExerciseDisplay(ex, {});
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
  wrap.innerHTML = `<div class="section-title">Übung ${currentExerciseIdx+1}/${currentWorkoutQueue.length}</div>
    <div class="upcoming-wrap"><div class="upcoming-title">${BODY_LABELS[ex.body]}</div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;letter-spacing:1px;color:#fff;margin-bottom:10px">${display.name}</div>
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

  if (instr) {
    document.getElementById("toggleInstrBtn").addEventListener("click", () => {
      const box = document.getElementById("instrBox");
      const btn = document.getElementById("toggleInstrBtn");
      const isHidden = box.style.display === "none";
      box.style.display = isHidden ? "block" : "none";
      btn.textContent = isHidden ? "📋 Anleitung ausblenden" : "📋 Anleitung anzeigen";
    });
  }

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
    if (!trainingUser) {
      showToast("Bitte zuerst deinen Namen oben eintragen, bevor du speicherst.", "error", 3000);
      return;
    }
    try {
      await push(logRef(trainingUser, ex.id), logEntry);
      showToast(`Übung gespeichert (${currentSets.length} Sätze, Ø ${avgWeight} kg × ${avgReps} Wdh.).`, "success", 2200);
    } catch (err) {
      console.error("Speichern fehlgeschlagen (voller Eintrag):", err, logEntry);
      // Fallback: Falls die Datenbank-Regeln das erweiterte Format mit der Saetze-Liste ablehnen
      // (z.B. PERMISSION_DENIED durch strikte Validierungsregeln), versuche es ohne das "sets"-Feld,
      // damit zumindest Durchschnittsgewicht/-wiederholungen gespeichert werden.
      const { sets, ...fallbackEntry } = logEntry;
      try {
        await push(logRef(trainingUser, ex.id), fallbackEntry);
        showToast(`Übung gespeichert (Ø ${avgWeight} kg × ${avgReps} Wdh. – Satz-Details konnten wegen Datenbank-Einschränkung nicht gespeichert werden).`, "info", 4500);
      } catch (err2) {
        console.error("Speichern fehlgeschlagen (Fallback ohne sets):", err2, fallbackEntry);
        showToast("Speichern fehlgeschlagen: " + (err2 && err2.message ? err2.message : "Unbekannter Fehler") + ". Bitte Datenbank-Regeln in der Firebase-Konsole prüfen.", "error", 5000);
        return;
      }
    }
    completedBodies.add(ex.body);
    await saveLastWorkout(trainingUser, currentWorkoutQueue.slice(0, currentExerciseIdx + 1).map(e=>e.id));
    currentExerciseIdx++;
    if (currentExerciseIdx >= currentWorkoutQueue.length) {
      await saveLastWorkout(trainingUser, currentWorkoutQueue.slice(0, currentExerciseIdx).map(e=>e.id));
      renderTrainingExercise();
    } else {
      await refreshLastWorkoutBox();
      renderRestTimer();
    }
  });
  document.getElementById("skipExBtn").addEventListener("click", () => { currentExerciseIdx++; renderTrainingExercise(); });

  const last = await getLastLog(trainingUser, ex.id);
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

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + tab).classList.add("active");
  document.querySelectorAll(".navmenu-item").forEach(i => i.classList.toggle("active", i.dataset.tab === tab));
  document.getElementById("navmenu").classList.remove("open");
  document.getElementById("navLabel").textContent = NAV_LABELS[tab];
  window.scrollTo(0,0);
  if (tab === "reserve") renderReservePage();
  if (tab === "home") renderAll();
  if (tab === "training") renderTrainingSetup();
  if (tab === "uebungen") renderUebungenPage();
}

const NAV_LABELS = { home: "Status & Check-in", reserve: "Reservieren", training: "Training", ausstattung: "Ausstattung", uebungen: "Übungen" };

function initNav() {
  document.getElementById("navToggle").addEventListener("click", () => {
    document.getElementById("navmenu").classList.toggle("open");
  });
  document.querySelectorAll(".navmenu-item").forEach(item => {
    item.addEventListener("click", () => switchTab(item.dataset.tab));
  });
}

function initFaqListeners() {
  document.querySelectorAll(".faq-section-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const section = btn.parentElement;
      const isOpen = section.classList.contains("open");
      section.parentElement.querySelectorAll(".faq-section").forEach(s => s.classList.remove("open"));
      if (!isOpen) section.classList.add("open");
    });
  });
  document.querySelectorAll(".faq-question").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const isOpen = item.classList.contains("open");
      item.closest(".faq-section-inner").querySelectorAll(".faq-item").forEach(i => i.classList.remove("open"));
      if (!isOpen) item.classList.add("open");
    });
  });
}

// Sofort mit lokalem/leerem Stand rendern, damit man direkt etwas eintragen kann,
// statt auf die erste Antwort von Firebase zu warten
renderAll();
renderWeekOverview();

onValue(statusRef, snap => { currentStatus = snap.val(); renderAll(); });
onValue(scheduleRef, snap => { currentSchedule = snap.val() || {}; renderAll(); if (activeTab==="reserve") renderReservePage(); });
setInterval(renderAll, 60000);

loadCustomExercises();
initFaqListeners();
initNav();
initTheme();
