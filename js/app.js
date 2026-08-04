/**
 * Keller Gym — app orchestrator (Phase 1).
 * Feature modules: auth, growth, reservations, exercises, training + services/*.
 */
import { ref, onValue, set, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "./firebase.js";
import { ensureAuth, watchAuth, completeEmailLinkSignIn, onAuthChange } from "./auth.js";
import { initAuthPanel } from "./auth-ui.js";
import { initTelemetry, trackEvent, trackError, exposeTelemetryGlobal } from "./telemetry.js";
import { ensureSchemaVersion } from "./services/schema.js";
import { loadUserRole, isOwnerRole } from "./services/roles.js";
import { renderGrowthSections, recordWorkoutFeed } from "./growth.js";
import {
  showToast,
  initTheme,
  fmt,
  formatTime,
  minutesLeft,
  progressPct,
  DAYS,
  DAYS_SHORT
} from "./ui.js";
import { setTrainingUser as persistTrainingUser } from "./state.js";
import { BODY_LABELS } from "./data.js";
import { createExercisesModule } from "./exercises.js";
import { createTrainingModule } from "./training.js";
import { createReservationsModule } from "./reservations.js";

const OWNER_PIN = "1234";

const statusRef = ref(db, "gym/status");
const scheduleRef = ref(db, "gym/schedule");

window.addEventListener("offline", () => showToast("Keine Internetverbindung – Änderungen werden ggf. nicht gespeichert.", "error", 5000));
window.addEventListener("online", () => showToast("Verbindung wiederhergestellt.", "success", 2500));

let currentStatus = null;
let currentSchedule = {};
let isOwner = false;
let activeTab = "home";
let weekOffset = 0;
let selectedDayDetail = null;
let trainingUser = localStorage.getItem("kg_user") || "";
let pendingWorkoutStart = false;
let checkedInAs = "";
let growthMvpInitialized = false;

function updateOwnerUI() {
  const footer = document.getElementById("appFooterVersion");
  if (footer) footer.hidden = !isOwner;
}

function checkinToTrainingDuration(min) {
  if (min >= 60) return 60;
  if (min >= 45) return 45;
  if (min >= 30) return 30;
  return 15;
}

/* ================= GROWTH / PROFILES ================= */

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

/* ================= FEATURE MODULES ================= */

const exercisesModule = createExercisesModule({
  getIsOwner: () => isOwner,
  setIsOwner: (value) => { isOwner = !!value; },
  ownerPin: OWNER_PIN,
  updateOwnerUI
});

const trainingModule = createTrainingModule({
  getTrainingUser: () => trainingUser,
  setTrainingUser: (name) => {
    trainingUser = String(name || "").trim();
    persistTrainingUser(trainingUser);
  },
  getGrowthMvpInitialized: () => growthMvpInitialized,
  setGrowthMvpInitialized: (value) => { growthMvpInitialized = !!value; },
  recordWorkoutCompletion,
  showToast,
  bodyLabels: BODY_LABELS,
  ...exercisesModule
});

const { loadCustomExercises, renderUebungenPage } = exercisesModule;
const { renderTrainingSetup, renderDbOverview, hideWorkoutProgress, setSelectedDuration } = trainingModule;

const reservations = createReservationsModule({
  getSchedule: () => currentSchedule,
  getWeekOffset: () => weekOffset,
  setWeekOffset: (n) => { weekOffset = n; },
  getSelectedDayDetail: () => selectedDayDetail,
  setSelectedDayDetail: (v) => { selectedDayDetail = v; },
  getIsOwner: () => isOwner,
  setIsOwner: (v) => { isOwner = !!v; },
  ownerPin: OWNER_PIN,
  scheduleRef,
  updateOwnerUI,
  renderDbOverview
});

const {
  getScheduleInfo,
  blockLabel,
  blockTimeStr,
  blockWhenStr,
  renderWeekOverview,
  renderReservePage
} = reservations;

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
      <div class="time-row" style="margin-top:16px"><span class="label-small">Frei ab</span><span class="big-time">${fmt(activeBlock.endH, activeBlock.endM)}</span></div>`;
  } else {
    cardHTML = `<div class="dot green">💪</div><div class="big-label lime">FREI</div><div class="sub">Gym ist verfügbar</div>`;
  }

  let upcomingHTML = "";
  if (upcomingBlocks.length > 0) {
    upcomingHTML = `<div class="upcoming-wrap"><div class="upcoming-title">DEMNÄCHST</div>
      ${upcomingBlocks.map((b) => `<div class="upcoming-row"><div>
        <div class="upcoming-when">${blockWhenStr(b)}${b.recurring ? " · " + DAYS[b.day] : ""}</div>
        <div class="upcoming-label">${blockLabel(b)} · ${blockTimeStr(b)}</div>
      </div>${isOwner ? `<button class="del-btn" data-id="${b.id}">✕</button>` : ""}</div>`).join("")}
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
    if (data.until <= Date.now()) {
      clearInterval(tickInterval);
      renderAll();
    }
  }, 30000);
}

function attachHomeListeners() {
  let selectedMin = 30;
  document.querySelectorAll(".btn-dur").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".btn-dur").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedMin = parseInt(btn.dataset.min, 10);
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
    trackEvent("checkin", { duration: selectedMin });
    set(statusRef, { until: Date.now() + selectedMin * 60000, name, duration: selectedMin });
  });
  document.getElementById("startWorkoutBtn")?.addEventListener("click", () => {
    pendingWorkoutStart = false;
    switchTab("training");
  });
  document.getElementById("checkoutBtn")?.addEventListener("click", () => {
    pendingWorkoutStart = false;
    checkedInAs = "";
    trackEvent("checkout");
    remove(statusRef);
  });
  document.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", () => remove(ref(db, "gym/schedule/" + btn.dataset.id)));
  });
}

/* ================= TAB NAVIGATION ================= */

function switchTab(tab) {
  activeTab = tab;
  if (tab !== "training") hideWorkoutProgress();
  document.querySelectorAll(".tab-page").forEach((p) => p.classList.remove("active"));
  document.getElementById("page-" + tab).classList.add("active");
  document.querySelectorAll(".bottom-tab").forEach((i) => i.classList.toggle("active", i.dataset.tab === tab));
  document.getElementById("navLabel").textContent = NAV_LABELS[tab];
  window.scrollTo(0, 0);
  trackEvent("tab_switch", { tab });
  if (tab === "reserve") renderReservePage();
  if (tab === "home") renderAll();
  if (tab === "training") renderTrainingSetup();
  if (tab === "uebungen") renderUebungenPage();
}

const NAV_LABELS = {
  home: "Übersicht",
  reserve: "Reservieren",
  training: "Training",
  ausstattung: "Ausstattung",
  uebungen: "Übungen"
};

function initNav() {
  document.querySelectorAll(".bottom-tab").forEach((item) => {
    item.addEventListener("click", () => switchTab(item.dataset.tab));
  });
}

function initFaqListeners() {
  document.querySelectorAll(".faq-section-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.parentElement;
      const isOpen = section.classList.contains("open");
      section.parentElement.querySelectorAll(".faq-section").forEach((s) => s.classList.remove("open"));
      if (!isOpen) section.classList.add("open");
    });
  });
  document.querySelectorAll(".faq-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const isOpen = item.classList.contains("open");
      item.closest(".faq-section-inner").querySelectorAll(".faq-item").forEach((i) => i.classList.remove("open"));
      if (!isOpen) item.classList.add("open");
    });
  });
}

/* ================= BOOT ================= */

async function syncRoleFromAuth(uid) {
  if (!uid) return;
  try {
    const role = await loadUserRole(uid);
    if (isOwnerRole(role)) {
      isOwner = true;
      updateOwnerUI();
      trackEvent("role_owner_from_firebase");
    }
  } catch (err) {
    trackError(err, { source: "boot.role" });
  }
}

async function boot() {
  initTelemetry();
  exposeTelemetryGlobal();
  initTheme();
  initFaqListeners();
  initNav();
  updateOwnerUI();

  initAuthPanel({
    showToast,
    onAuthUiChange: (snap) => {
      trackEvent("auth_ui_state", {
        permanent: !!snap.isPermanent,
        anonymous: !!snap.isAnonymous
      });
    }
  });

  // Local-first paint while auth/Firebase catch up
  renderAll();
  renderWeekOverview();

  try {
    await ensureAuth();
    try {
      const linked = await completeEmailLinkSignIn();
      if (linked?.isPermanent) {
        showToast("Konto verknüpft – willkommen zurück.", "success", 4000);
      }
    } catch (err) {
      trackError(err, { source: "boot.email_link" });
      showToast(err?.message || "E-Mail-Link Anmeldung fehlgeschlagen.", "error", 5000);
    }

    watchAuth();
    onAuthChange(async (snap) => {
      await syncRoleFromAuth(snap.uid);
      if (!shouldSkipGrowthMvpRefresh()) renderGrowthMvpSections();
    });

    await ensureSchemaVersion();
    trackEvent("boot_ready");
  } catch (err) {
    trackError(err, { source: "boot.auth" });
    showToast("Anmeldung fehlgeschlagen – App läuft eingeschränkt.", "error", 5000);
  }

  onValue(statusRef, (snap) => {
    currentStatus = snap.val();
    renderAll();
  });
  onValue(scheduleRef, (snap) => {
    currentSchedule = snap.val() || {};
    renderAll();
    if (activeTab === "reserve") renderReservePage();
  });
  setInterval(renderAll, 60000);

  loadCustomExercises();
}

boot();
