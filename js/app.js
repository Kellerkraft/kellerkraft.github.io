import { ref, onValue, set, remove, push } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "./firebase.js";
import { ensureAuth, watchAuth, completeEmailLinkSignIn, getAuthSnapshot, onAuthChange } from "./auth.js";
import { initAuthPanel } from "./auth-ui.js";
import { initTelemetry, trackEvent, trackError, exposeTelemetryGlobal } from "./telemetry.js";
import { ensureSchemaVersion } from "./services/schema.js";
import { loadUserRole, isOwnerRole, ROLES } from "./services/roles.js";
import { renderGrowthSections, recordWorkoutFeed } from "./growth.js";
import { showToast, initTheme, applyTheme, fmt, localDateStr, formatTime, minutesLeft, progressPct, DAYS, DAYS_SHORT } from "./ui.js";
import { state, setTrainingUser as persistTrainingUser } from "./state.js";
import { SCHEMA_VERSION } from "./data-model.js";
import { BODY_LABELS } from "./data.js";
import { createExercisesModule } from "./exercises.js";
import { createTrainingModule } from "./training.js";

const OWNER_PIN = "1234";

const statusRef = ref(db, "gym/status");
const scheduleRef = ref(db, "gym/schedule");

window.addEventListener("offline", () => showToast("Keine Internetverbindung – Änderungen werden ggf. nicht gespeichert.", "error", 5000));
window.addEventListener("online", () => showToast("Verbindung wiederhergestellt.", "success", 2500));

let currentStatus   = null;
let currentSchedule = {};
let isOwner = false;

function updateOwnerUI() {
  const footer = document.getElementById("appFooterVersion");
  if (footer) footer.hidden = !isOwner;
}
let activeTab = "home";
let weekOffset = 0;
let selectedDayDetail = null;
let trainingUser = localStorage.getItem("kg_user") || "";
let pendingWorkoutStart = false;
let checkedInAs = "";
let growthMvpInitialized = false;

function checkinToTrainingDuration(min) {
  if (min >= 60) return 60;
  if (min >= 45) return 45;
  if (min >= 30) return 30;
  return 15;
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
function isScheduleEntryPast(b) {
  // Weekly recurring slots stay visible; only one-off past dates are hidden
  if (b.recurring) return false;
  if (!b.date) return false;
  const end = new Date(b.date + "T00:00:00");
  end.setHours(b.endH || 0, b.endM || 0, 0, 0);
  return end.getTime() <= Date.now();
}
function blockWhenStr(b) {
  if (b.sameDay) { const h=Math.floor(b.minsUntil/60),m=b.minsUntil%60; return h===0?`in ${m} min`:m===0?`in ${h} Std`:`in ${h} Std ${m} min`; }
  const d = b.daysUntil||b.diffDays;
  return d===1?"morgen":b.recurring?DAYS[b.day]:`in ${d} Tagen`;
}

/* ================= GROWTH / PROFILES (module: growth.js) ================= */

function growthDeps() {
  return {
    getTrainingUser: () => trainingUser,
    setTrainingUser: (name) => {
      trainingUser = String(name || "").trim();
      persistTrainingUser(trainingUser);
    },
    showToast,
    onProfileSaved: () => {
      trackEvent("profile_saved_ui");
      renderAll();
    },
    bodyLabels: BODY_LABELS,
    daysShort: DAYS_SHORT
  };
}

async function renderGrowthMvpSections() {
  await renderGrowthSections(growthDeps());
}

async function recordWorkoutCompletion(user, exerciseCount) {
  await recordWorkoutFeed(user, exerciseCount);
}

const exercisesModule = createExercisesModule({
  getIsOwner: () => isOwner,
  setIsOwner: value => { isOwner = !!value; },
  ownerPin: OWNER_PIN,
  updateOwnerUI
});

const trainingModule = createTrainingModule({
  getTrainingUser: () => trainingUser,
  setTrainingUser: name => {
    trainingUser = String(name || "").trim();
    persistTrainingUser(trainingUser);
  },
  getGrowthMvpInitialized: () => growthMvpInitialized,
  setGrowthMvpInitialized: value => { growthMvpInitialized = !!value; },
  recordWorkoutCompletion,
  showToast,
  bodyLabels: BODY_LABELS,
  ...exercisesModule
});

const { loadCustomExercises, renderUebungenPage } = exercisesModule;
const { renderTrainingSetup, renderDbOverview, hideWorkoutProgress, setSelectedDuration } = trainingModule;

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
  // Day-parts: Vormittag 06–12 | Nachmittag 12–18 | Abend 18–24
  const parts = [
    ["morning", 6 * 60, 12 * 60],
    ["afternoon", 12 * 60, 18 * 60],
    ["evening", 18 * 60, 24 * 60]
  ];
  blocks.forEach(b => {
    const s = (Number(b.startH) || 0) * 60 + (Number(b.startM) || 0);
    const e = (Number(b.endH) || 0) * 60 + (Number(b.endM) || 0);
    if (!(e > s)) return;
    parts.forEach(([key, from, to]) => {
      const overlap = Math.min(e, to) - Math.max(s, from);
      if (overlap > 0) seg[key] = true;
    });
  });
  return seg;
}

function renderWeekOverview() {
  const wrap = document.getElementById("weekOverview");
  if (!wrap) return;
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
        <div class="week-seg${seg.morning?" busy":""}" title="Vormittag"><span>Vormittag</span></div>
        <div class="week-seg${seg.afternoon?" busy":""}" title="Nachmittag"><span>Nachmittag</span></div>
        <div class="week-seg${seg.evening?" busy":""}" title="Abend"><span>Abend</span></div>
      </div>
      <span class="week-chevron">›</span>
    </button>`;
  }
  const rangeLabel = `${wk.getDate()}.${wk.getMonth()+1}. – ${new Date(wk.getTime()+6*86400000).getDate()}.${new Date(wk.getTime()+6*86400000).getMonth()+1}.`;
  wrap.innerHTML = `
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

function shouldSkipGrowthMvpRefresh() {
  const activeEl = document.activeElement;
  if (!activeEl) return false;
  const mvpRoot = document.getElementById("growthMvpSections");
  if (!mvpRoot) return false;
  const isEditingField = ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName);
  return isEditingField && mvpRoot.contains(activeEl);
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

  const cardEl = document.getElementById("card");
  cardEl.className = effectivelyBusy ? "hero-card hero-busy" : "hero-card hero-free";
  cardEl.innerHTML = cardHTML;
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

  document.getElementById("form").innerHTML = formHTML;

  attachHomeListeners();
  if (!isFreeCheckin) startLocalTick(currentStatus);
  if (!shouldSkipGrowthMvpRefresh()) {
    renderGrowthMvpSections();
  }
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
      persistTrainingUser(trainingUser);
    }
    const name = raw || "Jemand";
    checkedInAs = name;
    pendingWorkoutStart = true;
    setSelectedDuration(checkinToTrainingDuration(selectedMin));
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
  const entries = Object.entries(currentSchedule).filter(([, b]) => !isScheduleEntryPast(b));
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

  renderWeekOverview();
  if (isOwner) renderDbOverview();

  document.getElementById("ownerLogin")?.addEventListener("click", () => {
    const pin = prompt("Owner PIN:");
    if (pin === OWNER_PIN) { isOwner = true; updateOwnerUI(); renderReservePage(); } else alert("Falscher PIN.");
  });
  document.getElementById("ownerLogout")?.addEventListener("click", () => { isOwner = false; updateOwnerUI(); renderReservePage(); });
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



function switchTab(tab) {
  activeTab = tab;
  if (tab !== "training") hideWorkoutProgress();
  document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + tab).classList.add("active");
  document.querySelectorAll(".bottom-tab").forEach(i => i.classList.toggle("active", i.dataset.tab === tab));
  document.getElementById("navLabel").textContent = NAV_LABELS[tab];
  window.scrollTo(0,0);
  if (tab === "reserve") renderReservePage();
  if (tab === "home") renderAll();
  if (tab === "training") renderTrainingSetup();
  if (tab === "uebungen") renderUebungenPage();
}

const NAV_LABELS = { home: "Übersicht", reserve: "Reservieren", training: "Training", ausstattung: "Ausstattung", uebungen: "Übungen" };

function initNav() {
  document.querySelectorAll(".bottom-tab").forEach(item => {
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
updateOwnerUI();
