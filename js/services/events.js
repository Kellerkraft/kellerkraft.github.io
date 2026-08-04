/**
 * Activity feed / events service — v2 gym/events with legacy fallback.
 */
import { ref, get, push, set } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { db } from "../firebase.js";
import { Paths, buildEvent, EVENT_TYPES } from "../data-model.js";
import { auth } from "../firebase.js";
import { trackEvent, trackError } from "../telemetry.js";

const LOCAL_KEY = "kg_feed_local_v2";

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocal(list) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 40)));
}

async function loadLegacyFeed(limit) {
  try {
    const snap = await get(ref(db, Paths.legacy.mvpFeed()));
    const data = snap.val() || {};
    return Object.values(data)
      .filter(Boolean)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, limit)
      .map((item) => buildEvent({
        type: EVENT_TYPES.includes(item.type) ? item.type : "workout",
        text: item.text,
        user: item.user,
        uid: item.uid || null,
        ts: item.ts
      }));
  } catch {
    return [];
  }
}

export async function addFeedEvent(type, text, user = "") {
  const uid = auth.currentUser?.uid || null;
  const event = buildEvent({ type, text, user, uid });
  try {
    const newRef = push(ref(db, Paths.events()));
    await set(newRef, event);
    trackEvent("feed_event", { type: event.type });
    return event;
  } catch (err) {
    trackError(err, { source: "events.write" });
    const list = readLocal();
    list.unshift({ ...event, localOnly: true });
    writeLocal(list);
    return event;
  }
}

export async function getRecentFeed(limit = 8) {
  try {
    const snap = await get(ref(db, Paths.events()));
    const data = snap.val() || {};
    const remote = Object.values(data)
      .filter(Boolean)
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .slice(0, limit);
    if (remote.length) {
      return remote.map((item) => buildEvent(item));
    }
  } catch (err) {
    trackError(err, { source: "events.load" });
  }

  const legacy = await loadLegacyFeed(limit);
  const local = readLocal();
  return [...legacy, ...local]
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, limit);
}
