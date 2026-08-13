/**
 * Reservations / schedule feature module — Wochenübersicht + Terminverwaltung.
 */
import { ref, push, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "./firebase.js";
import { fmt, localDateStr, DAYS, DAYS_SHORT } from "./ui.js";
import { trackEvent, trackError } from "./telemetry.js";

/**
 * @param {object} ctx
 * @param {() => object} ctx.getSchedule
 * @param {() => number} ctx.getWeekOffset
 * @param {(n: number) => void} ctx.setWeekOffset
 * @param {() => string|null} ctx.getSelectedDayDetail
 * @param {(v: string|null) => void} ctx.setSelectedDayDetail
 * @param {() => boolean} ctx.getIsOwner
 * @param {(v: boolean) => void} ctx.setIsOwner
 * @param {string} ctx.ownerPin
 * @param {import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js").DatabaseReference} ctx.scheduleRef
 * @param {() => void} ctx.updateOwnerUI
 * @param {() => void|Promise<void>} [ctx.renderDbOverview]
 */
export function createReservationsModule(ctx) {
  function blockLabel(b) {
    return b.label || "Reserviert";
  }

  function blockTimeStr(b) {
    return `${fmt(b.startH, b.startM)} – ${fmt(b.endH, b.endM)} Uhr`;
  }

  function isScheduleEntryPast(b) {
    if (b.recurring) return false;
    if (!b.date) return false;
    const end = new Date(b.date + "T00:00:00");
    end.setHours(b.endH || 0, b.endM || 0, 0, 0);
    return end.getTime() <= Date.now();
  }

  function blockWhenStr(b) {
    if (b.sameDay) {
      const h = Math.floor(b.minsUntil / 60);
      const m = b.minsUntil % 60;
      return h === 0 ? `in ${m} min` : m === 0 ? `in ${h} Std` : `in ${h} Std ${m} min`;
    }
    const d = b.daysUntil || b.diffDays;
    return d === 1 ? "morgen" : b.recurring ? DAYS[b.day] : `in ${d} Tagen`;
  }

  function getScheduleInfo() {
    const currentSchedule = ctx.getSchedule() || {};
    const now = new Date();
    const dow = now.getDay();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    let activeBlock = null;
    const upcomingBlocks = [];

    Object.entries(currentSchedule).forEach(([id, block]) => {
      const startMins = block.startH * 60 + block.startM;
      const endMins = block.endH * 60 + block.endM;

      if (block.recurring) {
        if (block.day === dow && nowMins >= startMins && nowMins < endMins) {
          activeBlock = { ...block, id };
        } else if (block.day === dow && nowMins < startMins) {
          upcomingBlocks.push({ ...block, id, minsUntil: startMins - nowMins, sameDay: true });
        } else if (block.day !== dow) {
          const diff = (block.day - dow + 7) % 7;
          upcomingBlocks.push({ ...block, id, daysUntil: diff, sameDay: false });
        }
      } else {
        const blockDate = new Date(block.date + "T00:00:00");
        const todayDate = new Date(localDateStr(now) + "T00:00:00");
        const diffDays = Math.round((blockDate - todayDate) / 86400000);
        if (diffDays === 0 && nowMins >= startMins && nowMins < endMins) {
          activeBlock = { ...block, id };
        } else if (diffDays === 0 && nowMins < startMins) {
          upcomingBlocks.push({ ...block, id, minsUntil: startMins - nowMins, sameDay: true, diffDays: 0 });
        } else if (diffDays > 0) {
          upcomingBlocks.push({ ...block, id, daysUntil: diffDays, sameDay: false, diffDays });
        }
      }
    });

    upcomingBlocks.sort((a, b) => {
      const aVal = a.sameDay ? (a.minsUntil || 0) : (a.daysUntil || 0) * 1440;
      const bVal = b.sameDay ? (b.minsUntil || 0) : (b.daysUntil || 0) * 1440;
      return aVal - bVal;
    });
    return { activeBlock, upcomingBlocks: upcomingBlocks.slice(0, 3) };
  }

  function startOfWeek(offset) {
    const d = new Date();
    const dow = d.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diffToMonday + offset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function blocksForDate(dateObj) {
    const currentSchedule = ctx.getSchedule() || {};
    const dow = dateObj.getDay();
    const dateStr = localDateStr(dateObj);
    const list = [];
    Object.entries(currentSchedule).forEach(([id, block]) => {
      if (block.recurring && block.day === dow) list.push({ ...block, id });
      else if (!block.recurring && block.date === dateStr) list.push({ ...block, id });
    });
    list.sort((a, b) => (a.startH * 60 + a.startM) - (b.startH * 60 + b.startM));
    return list;
  }

  function segmentCoverage(blocks) {
    const seg = { morning: false, afternoon: false, evening: false };
    const parts = [
      ["morning", 6 * 60, 12 * 60],
      ["afternoon", 12 * 60, 18 * 60],
      ["evening", 18 * 60, 24 * 60]
    ];
    blocks.forEach((b) => {
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

  function renderDayDetail() {
    const wrap = document.getElementById("dayDetailModal");
    if (!wrap) return;
    const selectedDayDetail = ctx.getSelectedDayDetail();
    if (!selectedDayDetail) {
      wrap.classList.remove("open");
      wrap.innerHTML = "";
      return;
    }
    const d = new Date(selectedDayDetail + "T00:00:00");
    const blocks = blocksForDate(d);
    const dateLabel = `${DAYS[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
    const rows = blocks.length
      ? blocks.map((b) => `<div class="detail-row">
          <div class="detail-time">${fmt(b.startH, b.startM)}–${fmt(b.endH, b.endM)}</div>
          <div class="detail-label">${blockLabel(b)}${b.recurring ? ' <span class="detail-tag">wöchentlich</span>' : ""}</div>
        </div>`).join("")
      : `<div class="detail-empty">Keine Reservierungen an diesem Tag – frei nutzbar.</div>`;
    wrap.innerHTML = `<div class="modal-backdrop"></div>
      <div class="modal-card">
        <div class="modal-title">${dateLabel}</div>
        <div class="detail-list">${rows}</div>
        <button class="btn-main btn-dark" id="closeDayDetail">Schließen</button>
      </div>`;
    wrap.classList.add("open");
    wrap.querySelector(".modal-backdrop").addEventListener("click", () => {
      ctx.setSelectedDayDetail(null);
      renderDayDetail();
    });
    document.getElementById("closeDayDetail").addEventListener("click", () => {
      ctx.setSelectedDayDetail(null);
      renderDayDetail();
    });
  }

  function renderWeekOverview() {
    const wrap = document.getElementById("weekOverview");
    if (!wrap) return;
    const weekOffset = ctx.getWeekOffset();
    const wk = startOfWeek(weekOffset);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let rows = "";
    for (let i = 0; i < 7; i++) {
      const d = new Date(wk);
      d.setDate(wk.getDate() + i);
      const blocks = blocksForDate(d);
      const seg = segmentCoverage(blocks);
      const isToday = d.getTime() === today.getTime();
      const dateStr = localDateStr(d);
      rows += `<button class="week-row${isToday ? " is-today" : ""}" data-date="${dateStr}">
        <div class="week-day">
          <span class="week-day-name">${DAYS_SHORT[d.getDay()]}</span>
          <span class="week-day-num">${d.getDate()}.${d.getMonth() + 1}.</span>
        </div>
        <div class="week-bar">
          <div class="week-seg${seg.morning ? " busy" : ""}" title="Vormittag"><span>Vormittag</span></div>
          <div class="week-seg${seg.afternoon ? " busy" : ""}" title="Nachmittag"><span>Nachmittag</span></div>
          <div class="week-seg${seg.evening ? " busy" : ""}" title="Abend"><span>Abend</span></div>
        </div>
        <span class="week-chevron">›</span>
      </button>`;
    }
    const end = new Date(wk.getTime() + 6 * 86400000);
    const rangeLabel = `${wk.getDate()}.${wk.getMonth() + 1}. – ${end.getDate()}.${end.getMonth() + 1}.`;
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

    document.getElementById("weekPrev")?.addEventListener("click", () => {
      ctx.setWeekOffset(weekOffset - 1);
      renderWeekOverview();
    });
    document.getElementById("weekNext")?.addEventListener("click", () => {
      ctx.setWeekOffset(weekOffset + 1);
      renderWeekOverview();
    });
    document.querySelectorAll(".week-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        ctx.setSelectedDayDetail(btn.dataset.date);
        renderDayDetail();
      });
    });
  }

  function renderReservePage() {
    const wrap = document.getElementById("reserveContent");
    if (!wrap) return;
    const isOwner = ctx.getIsOwner();
    const currentSchedule = ctx.getSchedule() || {};

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
          ${DAYS_SHORT.map((d, i) => `<button class="day-btn${i === 3 ? " active" : ""}" data-day="${i}">${d}</button>`).join("")}
        </div>
        <div id="schedDateWrap"><div class="field-label">Datum</div><input type="date" id="schedDate" class="time-input" value="${localDateStr(new Date())}"></div>
        <button id="addSchedBtn" class="btn-main btn-owner">+ Termin speichern</button>
      </div>`;

    let allBlocksHTML = "";
    const entries = Object.entries(currentSchedule).filter(([, b]) => !isScheduleEntryPast(b));
    if (entries.length > 0) {
      const sorted = entries.sort((a, b) => {
        const av = a[1].recurring
          ? a[1].day * 1440 + a[1].startH * 60 + a[1].startM
          : new Date(a[1].date).getTime() / 60000 + a[1].startH * 60 + a[1].startM;
        const bv = b[1].recurring
          ? b[1].day * 1440 + b[1].startH * 60 + b[1].startM
          : new Date(b[1].date).getTime() / 60000 + b[1].startH * 60 + b[1].startM;
        return av - bv;
      });
      allBlocksHTML = `<div class="upcoming-wrap"><div class="upcoming-title">ALLE TERMINE</div>
        ${sorted.map(([id, b]) => `<div class="upcoming-row"><div>
          <div class="upcoming-when">${b.recurring ? "jeden " + DAYS[b.day] : new Date(b.date + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</div>
          <div class="upcoming-label">${blockLabel(b)} · ${blockTimeStr(b)}</div>
        </div>${isOwner ? `<button class="del-btn" data-id="${id}">✕</button>` : ""}</div>`).join("")}
      </div>`;
    }

    const dbOverviewPlaceholder = isOwner
      ? `<div class="section-title" style="margin-top:20px">🗄️ Datenbank-Übersicht (Owner)</div><div id="dbOverviewBox" class="info-box">Lade…</div>`
      : "";

    const formSection = `
      <div class="section-title"${entries.length === 0 ? "" : ' style="margin-top:20px"'}>Vorab reservieren</div>
      ${panelHTML}
      <div style="text-align:center;margin-top:16px">${ownerLinkHTML}</div>
    `;

    wrap.innerHTML = entries.length === 0
      ? `${formSection}${dbOverviewPlaceholder}`
      : `<div class="section-title">Terminübersicht</div>${allBlocksHTML}${formSection}${dbOverviewPlaceholder}`;

    renderWeekOverview();
    if (isOwner) ctx.renderDbOverview?.();

    document.getElementById("ownerLogin")?.addEventListener("click", () => {
      const pin = prompt("Owner PIN:");
      if (pin === ctx.ownerPin) {
        ctx.setIsOwner(true);
        ctx.updateOwnerUI();
        trackEvent("owner_login");
        renderReservePage();
      } else {
        alert("Falscher PIN.");
      }
    });
    document.getElementById("ownerLogout")?.addEventListener("click", () => {
      ctx.setIsOwner(false);
      ctx.updateOwnerUI();
      renderReservePage();
    });
    document.querySelectorAll(".del-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await remove(ref(db, "gym/schedule/" + btn.dataset.id));
          trackEvent("reservation_deleted");
        } catch (err) {
          trackError(err, { source: "reservations.delete" });
        }
      });
    });

    const recurCb = document.getElementById("schedRecur");
    recurCb?.addEventListener("change", () => {
      document.getElementById("schedDayWrap").style.display = recurCb.checked ? "flex" : "none";
      document.getElementById("schedDateWrap").style.display = recurCb.checked ? "none" : "block";
    });
    let selectedDay = 3;
    document.querySelectorAll(".day-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".day-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedDay = parseInt(btn.dataset.day, 10);
      });
    });
    document.getElementById("addSchedBtn")?.addEventListener("click", async () => {
      const label = document.getElementById("schedLabel").value.trim() || "Reserviert";
      const start = document.getElementById("schedStart").value.split(":").map(Number);
      const end = document.getElementById("schedEnd").value.split(":").map(Number);
      const recur = document.getElementById("schedRecur").checked;
      const date = document.getElementById("schedDate")?.value;
      if (start[0] * 60 + start[1] >= end[0] * 60 + end[1]) {
        alert("Endzeit muss nach Startzeit liegen.");
        return;
      }
      const entry = {
        label,
        startH: start[0],
        startM: start[1],
        endH: end[0],
        endM: end[1],
        recurring: recur
      };
      if (recur) entry.day = selectedDay;
      else entry.date = date;
      try {
        await push(ctx.scheduleRef, entry);
        trackEvent("reservation_created", { recurring: recur });
        document.getElementById("schedLabel").value = "";
      } catch (err) {
        trackError(err, { source: "reservations.create" });
        alert("Termin konnte nicht gespeichert werden.");
      }
    });
  }

  return {
    getScheduleInfo,
    blockLabel,
    blockTimeStr,
    blockWhenStr,
    isScheduleEntryPast,
    renderWeekOverview,
    renderDayDetail,
    renderReservePage
  };
}
