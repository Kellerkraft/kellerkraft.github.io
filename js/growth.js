/**
 * Growth / Profile feature — Profil, Wochenziel-Auszeichnung, Streaks, Feed.
 * Profile displayName is the same identity as the Training name.
 */
import { loadUserProfile, saveUserProfile } from "./services/users.js";
import { addFeedEvent, getRecentFeed } from "./services/events.js";
import { getUserStreak, getWeekTrainingDays } from "./services/logs.js";
import { getAuthSnapshot } from "./auth.js";
import { trackEvent, trackError } from "./telemetry.js";

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;");
}

function clampWeekGoal(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 3;
  return Math.min(7, Math.max(1, n));
}

function weekAwardKey(uid, weekGoal) {
  const now = new Date();
  const tmp = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
  return `kg_week_award_${uid}_${tmp.getUTCFullYear()}_w${weekNo}_g${weekGoal}`;
}

async function maybeAnnounceWeekAward(uid, user, avatar, weekDays, weekGoal) {
  if (!uid || weekDays < weekGoal) return false;
  const key = weekAwardKey(uid, weekGoal);
  if (localStorage.getItem(key) === "1") return false;
  localStorage.setItem(key, "1");
  const label = avatar ? `${avatar} ${user}` : user;
  await addFeedEvent(
    "streak",
    `${label} hat das Wochenziel erreicht (${weekDays}/${weekGoal} Trainingstage).`,
    user
  );
  trackEvent("week_goal_awarded", { weekDays, weekGoal });
  return true;
}

function renderWeekAwardCard(weekDays, weekGoal) {
  const earned = weekDays >= weekGoal;
  const pct = Math.min(100, Math.round((weekDays / Math.max(weekGoal, 1)) * 100));
  if (earned) {
    return `
      <div class="mvp-award mvp-award--earned" role="status">
        <div class="mvp-award-badge">★</div>
        <div class="mvp-award-copy">
          <div class="mvp-award-title">Wochenziel geschafft</div>
          <div class="mvp-award-sub">${weekDays} / ${weekGoal} Trainingstage diese Woche</div>
        </div>
      </div>`;
  }
  return `
    <div class="mvp-award mvp-award--progress" role="status">
      <div class="mvp-award-copy">
        <div class="mvp-award-title">Wochenziel</div>
        <div class="mvp-award-sub">${weekDays} / ${weekGoal} Trainingstage — noch ${Math.max(0, weekGoal - weekDays)} bis zur Auszeichnung</div>
      </div>
      <div class="mvp-award-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
    </div>`;
}

/**
 * Load profile for uid and sync displayName → Training name.
 * @returns {Promise<object|null>}
 */
export async function syncProfileToTrainingUser(uid, hintName, setTrainingUser) {
  if (!uid) return null;
  try {
    const profile = await loadUserProfile(uid, hintName || "");
    const name = String(profile.displayName || hintName || "").trim();
    if (name && typeof setTrainingUser === "function") {
      setTrainingUser(name);
    }
    return profile;
  } catch (err) {
    trackError(err, { source: "growth.sync_profile" });
    return null;
  }
}

/**
 * @param {object} deps
 * @param {() => string} deps.getTrainingUser
 * @param {(name: string) => void} deps.setTrainingUser
 * @param {(msg: string, type?: string, duration?: number) => void} deps.showToast
 * @param {() => void} [deps.onProfileSaved]
 */
export async function renderGrowthSections(deps) {
  const wrap = document.getElementById("growthMvpSections");
  if (!wrap) return;

  const authSnap = getAuthSnapshot();
  const uid = authSnap.uid;
  let user = (deps.getTrainingUser() || "").trim();

  if (!uid) {
    wrap.innerHTML = `<div class="mvp-card"><div class="mvp-title">Profil</div><div class="sub">Anmeldung läuft…</div></div>`;
    return;
  }

  const profile = await loadUserProfile(uid, user);
  // Profile name wins — same identity as Training
  if (profile.displayName && profile.displayName !== user) {
    deps.setTrainingUser(profile.displayName);
    user = profile.displayName;
  }
  user = user || profile.displayName || "";

  const [streak, weekDays, feedItems] = await Promise.all([
    getUserStreak(uid, user),
    getWeekTrainingDays(uid, user),
    getRecentFeed()
  ]);

  const weekGoal = clampWeekGoal(profile.weekGoal || 3);
  const earned = weekDays >= weekGoal;

  if (earned && user) {
    maybeAnnounceWeekAward(uid, user, profile.avatar, weekDays, weekGoal).catch(() => {});
  }

  wrap.innerHTML = `
    <div class="mvp-card">
      <div class="mvp-title">Profil</div>
      <div class="sub" style="margin-bottom:10px">Name = dein Trainingsprofil (gleicher Name unter Training &amp; Check-in).</div>
      <div class="mvp-grid">
        <input id="mvpProfileName" class="name-input" maxlength="40" placeholder="Name (wie unter Training)" value="${escapeAttr(profile.displayName || user)}">
        <input id="mvpProfileAvatar" class="name-input" maxlength="8" placeholder="Avatar" value="${escapeAttr(profile.avatar || "💪")}">
      </div>
      <input id="mvpProfileGoal" class="name-input" maxlength="200" placeholder="Ziel (z. B. fitter werden, Bankdrücken steigern)" value="${escapeAttr(profile.goal || "")}">
      <div class="field-label" style="margin-top:8px">Wochenziel (Trainingstage)</div>
      <input id="mvpWeekGoal" class="time-input" type="number" min="1" max="7" value="${weekGoal}" inputmode="numeric">
      <div class="sub" style="margin-top:6px">Erreichst du diese Anzahl Trainingstage in einer Woche, gibt’s eine Auszeichnung.</div>
      <button type="button" id="mvpSaveProfileBtn" class="btn-main btn-lime">Profil speichern</button>
    </div>

    <div class="mvp-card">
      <div class="mvp-title">Auszeichnung</div>
      ${user
        ? renderWeekAwardCard(weekDays, weekGoal)
        : `<div class="sub">Zuerst einen Namen speichern, dann zählt das Wochenziel.</div>`}
    </div>

    <div class="mvp-card">
      <div class="mvp-title">Streak</div>
      ${user
        ? `<div class="mvp-streak"><strong>${streak}</strong> Tage in Folge trainiert</div>
           <div class="sub">Diese Woche: ${weekDays} / ${weekGoal} Tage${earned ? " — Ziel erreicht" : ""}</div>`
        : `<div class="sub">Noch kein Trainingsprofil.</div>`}
    </div>

    <div class="mvp-card">
      <div class="mvp-title">Aktivität</div>
      <div class="mvp-feed-list">
        ${feedItems.length
          ? feedItems.map((item) => `<div class="mvp-feed-item"><div>${escapeAttr(item.text || "Aktivität")}</div><div class="mvp-feed-time">${new Date(item.ts || Date.now()).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div></div>`).join("")
          : `<div class="sub">Noch keine Aktivitäten vorhanden.</div>`}
      </div>
    </div>
  `;

  document.getElementById("mvpSaveProfileBtn")?.addEventListener("click", async () => {
    const nextName = document.getElementById("mvpProfileName").value.trim();
    if (!nextName) {
      deps.showToast("Bitte einen Namen eingeben (gleicher Name wie unter Training).", "error");
      return;
    }
    const payload = {
      displayName: nextName,
      avatar: (document.getElementById("mvpProfileAvatar").value.trim() || "💪").slice(0, 8),
      goal: document.getElementById("mvpProfileGoal").value.trim(),
      weekGoal: clampWeekGoal(document.getElementById("mvpWeekGoal").value),
      favoriteBodies: []
    };
    try {
      await saveUserProfile(payload, uid);
      deps.setTrainingUser(payload.displayName);
      await addFeedEvent("plan", `${payload.avatar} ${payload.displayName} hat das Profil aktualisiert.`, payload.displayName);
      deps.showToast("Profil gespeichert — gilt auch für Training.", "success");
      trackEvent("ui_profile_saved");
      deps.onProfileSaved?.();
      renderGrowthSections(deps);
    } catch (err) {
      trackError(err, { source: "growth.save_profile" });
      deps.setTrainingUser(payload.displayName);
      deps.showToast(`Profil lokal übernommen (${err?.code || err?.message || "Fehler"}).`, "error", 5000);
      renderGrowthSections(deps);
    }
  });
}

export async function recordWorkoutFeed(user, exerciseCount) {
  if (!user) return;
  try {
    await addFeedEvent("workout", `${user} hat ein Workout abgeschlossen (${exerciseCount} Übungen).`, user);

    const authSnap = getAuthSnapshot();
    const uid = authSnap.uid;
    if (!uid) return;

    const [profile, weekDays] = await Promise.all([
      loadUserProfile(uid, user),
      getWeekTrainingDays(uid, user)
    ]);
    const weekGoal = clampWeekGoal(profile.weekGoal || 3);
    await maybeAnnounceWeekAward(uid, user, profile.avatar, weekDays, weekGoal);
  } catch (err) {
    trackError(err, { source: "growth.workout_feed" });
  }
}
