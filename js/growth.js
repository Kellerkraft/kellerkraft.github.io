/**
 * Growth / Profile feature module — Profil, Plan-Builder, Streaks, Feed.
 */
import { loadUserProfile, saveUserProfile } from "./services/users.js";
import { loadWeeklyPlan, saveWeeklyPlan } from "./services/plans.js";
import { addFeedEvent, getRecentFeed } from "./services/events.js";
import { getUserStreak, getWeekTrainingDays } from "./services/logs.js";
import { getAuthSnapshot } from "./auth.js";
import { trackEvent, trackError } from "./telemetry.js";

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

function renderPlanDayOptions(daysShort, selectedDay) {
  return daysShort.map((day, i) => `<option value="${i}"${i === selectedDay ? " selected" : ""}>${day}</option>`).join("");
}

/**
 * @param {object} deps
 * @param {() => string} deps.getTrainingUser
 * @param {(name: string) => void} deps.setTrainingUser
 * @param {(msg: string, type?: string, duration?: number) => void} deps.showToast
 * @param {() => void} [deps.onProfileSaved]
 * @param {Record<string,string>} deps.bodyLabels
 * @param {string[]} deps.daysShort
 */
export async function renderGrowthSections(deps) {
  const wrap = document.getElementById("growthMvpSections");
  if (!wrap) return;

  const authSnap = getAuthSnapshot();
  const uid = authSnap.uid;
  const user = (deps.getTrainingUser() || "").trim();

  if (!uid) {
    wrap.innerHTML = `<div class="mvp-card"><div class="mvp-title">Profil &amp; Plan</div><div class="sub">Anmeldung läuft…</div></div>`;
    return;
  }

  if (!user) {
    wrap.innerHTML = `<div class="mvp-card"><div class="mvp-title">Profil &amp; Plan</div><div class="sub">Trage oben deinen Namen ein oder speichere ein Profil, um Plan-Builder, Streaks und Feed zu nutzen.</div></div>`;
    return;
  }

  const [profile, plan, streak, weekDays, feedItems] = await Promise.all([
    loadUserProfile(uid, user),
    loadWeeklyPlan(uid, user),
    getUserStreak(uid, user),
    getWeekTrainingDays(uid, user),
    getRecentFeed()
  ]);

  const blocks = (plan.blocks && plan.blocks.length)
    ? plan.blocks
    : [{ day: 1, focus: "Ganzkörper", note: "" }];

  const planRows = blocks.map((item, idx) => `
    <div class="mvp-plan-row" data-idx="${idx}">
      <select class="time-input mvp-plan-day">${renderPlanDayOptions(deps.daysShort, item.day ?? 1)}</select>
      <input class="name-input mvp-plan-focus" maxlength="30" placeholder="Fokus (z. B. Push)" value="${escapeAttr(item.focus || "")}">
      <input class="name-input mvp-plan-note" maxlength="60" placeholder="Notiz (optional)" value="${escapeAttr(item.note || "")}">
      <button type="button" class="btn-main btn-dark mvp-plan-remove">✕</button>
    </div>
  `).join("");

  const weekGoal = profile.weekGoal || 3;

  wrap.innerHTML = `
    <div class="mvp-card">
      <div class="mvp-title">Profil</div>
      <div class="mvp-grid">
        <input id="mvpProfileName" class="name-input" maxlength="40" placeholder="Name" value="${escapeAttr(profile.displayName || user)}">
        <input id="mvpProfileAvatar" class="name-input" maxlength="8" placeholder="Avatar" value="${escapeAttr(profile.avatar || "💪")}">
      </div>
      <input id="mvpProfileGoal" class="name-input" maxlength="200" placeholder="Ziel (z. B. 3x/Woche trainieren)" value="${escapeAttr(profile.goal || "")}">
      <div class="field-label" style="margin-top:8px">Wochenziel (Tage)</div>
      <input id="mvpWeekGoal" class="time-input" type="number" min="1" max="7" value="${weekGoal}">
      <div class="chip-row" id="mvpFavBodies" style="margin-top:10px">
        ${Object.entries(deps.bodyLabels).map(([k, l]) => `<button type="button" class="chip mvp-fav-chip${(profile.favoriteBodies || []).includes(k) ? " active" : ""}" data-body="${k}">${l}</button>`).join("")}
      </div>
      <button type="button" id="mvpSaveProfileBtn" class="btn-main btn-lime">Profil speichern</button>
    </div>

    <div class="mvp-card">
      <div class="mvp-title">Einfacher Plan-Builder</div>
      <div id="mvpPlanRows">${planRows}</div>
      <button type="button" id="mvpAddPlanRowBtn" class="btn-main btn-dark">+ Trainingstag</button>
      <button type="button" id="mvpSavePlanBtn" class="btn-main btn-lime">Plan speichern</button>
    </div>

    <div class="mvp-card">
      <div class="mvp-title">Streaks</div>
      <div class="mvp-streak"><strong>${streak}</strong> Tage in Folge trainiert</div>
      <div class="sub">Diese Woche: ${weekDays} / ${weekGoal} Tage${weekDays >= weekGoal ? " — Ziel erreicht ✓" : ""}</div>
    </div>

    <div class="mvp-card">
      <div class="mvp-title">Basis-Feed</div>
      <div class="mvp-feed-list">
        ${feedItems.length
          ? feedItems.map(item => `<div class="mvp-feed-item"><div>${escapeAttr(item.text || "Aktivität")}</div><div class="mvp-feed-time">${new Date(item.ts || Date.now()).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></div>`).join("")
          : `<div class="sub">Noch keine Aktivitäten vorhanden.</div>`}
      </div>
    </div>
  `;

  const favSet = new Set(profile.favoriteBodies || []);
  wrap.querySelectorAll(".mvp-fav-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const body = btn.dataset.body;
      if (favSet.has(body)) {
        favSet.delete(body);
        btn.classList.remove("active");
      } else {
        favSet.add(body);
        btn.classList.add("active");
      }
    });
  });

  document.getElementById("mvpSaveProfileBtn")?.addEventListener("click", async () => {
    const nextName = document.getElementById("mvpProfileName").value.trim() || user;
    const payload = {
      displayName: nextName,
      avatar: (document.getElementById("mvpProfileAvatar").value.trim() || "💪").slice(0, 8),
      goal: document.getElementById("mvpProfileGoal").value.trim(),
      weekGoal: parseInt(document.getElementById("mvpWeekGoal").value, 10) || 3,
      favoriteBodies: [...favSet]
    };
    try {
      await saveUserProfile(payload, uid);
      deps.setTrainingUser(payload.displayName);
      await addFeedEvent("plan", `${payload.avatar} ${payload.displayName} hat das Profil aktualisiert.`, payload.displayName);
      deps.showToast("Profil gespeichert.", "success");
      trackEvent("ui_profile_saved");
      deps.onProfileSaved?.();
      renderGrowthSections(deps);
    } catch (err) {
      trackError(err, { source: "growth.save_profile" });
      deps.setTrainingUser(payload.displayName);
      deps.showToast(`Profil nur lokal gespeichert (${err?.code || err?.message || "Fehler"}).`, "error", 5000);
      renderGrowthSections(deps);
    }
  });

  document.getElementById("mvpAddPlanRowBtn")?.addEventListener("click", () => {
    const rows = document.getElementById("mvpPlanRows");
    const idx = rows.querySelectorAll(".mvp-plan-row").length;
    rows.insertAdjacentHTML("beforeend", `
      <div class="mvp-plan-row" data-idx="${idx}">
        <select class="time-input mvp-plan-day">${renderPlanDayOptions(deps.daysShort, 1)}</select>
        <input class="name-input mvp-plan-focus" maxlength="30" placeholder="Fokus (z. B. Pull)">
        <input class="name-input mvp-plan-note" maxlength="60" placeholder="Notiz (optional)">
        <button type="button" class="btn-main btn-dark mvp-plan-remove">✕</button>
      </div>
    `);
    rows.querySelectorAll(".mvp-plan-remove").forEach(btn => {
      btn.onclick = () => btn.closest(".mvp-plan-row").remove();
    });
  });

  wrap.querySelectorAll(".mvp-plan-remove").forEach(btn => {
    btn.addEventListener("click", () => btn.closest(".mvp-plan-row").remove());
  });

  document.getElementById("mvpSavePlanBtn")?.addEventListener("click", async () => {
    const rows = [...wrap.querySelectorAll(".mvp-plan-row")].map(row => ({
      day: parseInt(row.querySelector(".mvp-plan-day").value, 10),
      focus: row.querySelector(".mvp-plan-focus").value.trim(),
      note: row.querySelector(".mvp-plan-note").value.trim(),
      exerciseIds: []
    })).filter(item => item.focus);
    if (!rows.length) {
      deps.showToast("Bitte mindestens einen Trainingstag mit Fokus angeben.", "error");
      return;
    }
    try {
      await saveWeeklyPlan({ name: "Wochenplan", blocks: rows }, uid);
      await addFeedEvent("plan", `${user} hat den Wochenplan aktualisiert (${rows.length} Tage).`, user);
      deps.showToast("Plan gespeichert.", "success");
      renderGrowthSections(deps);
    } catch (err) {
      trackError(err, { source: "growth.save_plan" });
      deps.showToast(`Plan nur lokal gespeichert (${err?.code || err?.message || "Fehler"}).`, "error", 5000);
      renderGrowthSections(deps);
    }
  });
}

export async function recordWorkoutFeed(user, exerciseCount) {
  if (!user) return;
  try {
    await addFeedEvent("workout", `${user} hat ein Workout abgeschlossen (${exerciseCount} Übungen).`, user);
  } catch (err) {
    trackError(err, { source: "growth.workout_feed" });
  }
}
