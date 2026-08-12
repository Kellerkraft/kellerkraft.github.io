/**
 * Offline helpers — IndexedDB queue for training writes + log snapshots.
 * Syncs to Firebase when back online.
 */
const DB_NAME = "kg_offline_v1";
const DB_VERSION = 1;
const STORE_QUEUE = "queue";
const STORE_LOGS = "logCache";
const STORE_LAST = "lastWorkoutCache";
const STORE_META = "meta";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_LOGS)) {
        db.createObjectStore(STORE_LOGS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_LAST)) {
        db.createObjectStore(STORE_LAST, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbReq(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
}

/** Race a promise against a timeout (used for Firebase writes when Wi‑Fi has no internet). */
export function withTimeout(promise, ms, message = "timeout") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

export async function enqueueWrite(item) {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, "readwrite");
  const payload = {
    ...item,
    createdAt: Date.now(),
    status: "pending"
  };
  await idbReq(tx.objectStore(STORE_QUEUE).add(payload));
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return true;
}

export async function listQueue() {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, "readonly");
  const rows = await idbReq(tx.objectStore(STORE_QUEUE).getAll());
  db.close();
  return (rows || []).filter((r) => r.status !== "done");
}

export async function removeQueueItem(id) {
  const db = await openDb();
  const tx = db.transaction(STORE_QUEUE, "readwrite");
  await idbReq(tx.objectStore(STORE_QUEUE).delete(id));
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function pendingCount() {
  const rows = await listQueue();
  return rows.length;
}

/** Cache full log tree for a user key (for offline history / last-log). */
export async function cacheLogTree(key, tree) {
  if (!key) return;
  const db = await openDb();
  const tx = db.transaction(STORE_LOGS, "readwrite");
  await idbReq(tx.objectStore(STORE_LOGS).put({ key, tree: tree || {}, updatedAt: Date.now() }));
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readCachedLogTree(key) {
  if (!key) return null;
  const db = await openDb();
  const tx = db.transaction(STORE_LOGS, "readonly");
  const row = await idbReq(tx.objectStore(STORE_LOGS).get(key));
  db.close();
  return row?.tree || null;
}

export async function cacheLastWorkout(key, data) {
  if (!key) return;
  const db = await openDb();
  const tx = db.transaction(STORE_LAST, "readwrite");
  await idbReq(tx.objectStore(STORE_LAST).put({ key, data, updatedAt: Date.now() }));
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readCachedLastWorkout(key) {
  if (!key) return null;
  const db = await openDb();
  const tx = db.transaction(STORE_LAST, "readonly");
  const row = await idbReq(tx.objectStore(STORE_LAST).get(key));
  db.close();
  return row?.data || null;
}

/**
 * Apply a local log entry into the cached tree immediately (optimistic offline).
 */
export async function mergeLogIntoCache(userKey, exId, entry) {
  const tree = (await readCachedLogTree(userKey)) || {};
  const exLogs = { ...(tree[exId] || {}) };
  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  exLogs[localId] = entry;
  tree[exId] = exLogs;
  await cacheLogTree(userKey, tree);
  return localId;
}

let syncing = false;

/**
 * Flush queue using provided writers.
 * @param {{ writeLog: Function, writeLastWorkout: Function }} writers
 */
export async function syncPendingWrites(writers = {}) {
  if (!isOnline() || syncing) return { synced: 0, remaining: await pendingCount() };
  syncing = true;
  let synced = 0;
  try {
    const rows = await listQueue();
    for (const row of rows) {
      try {
        if (row.type === "log" && writers.writeLog) {
          await writers.writeLog(row.userKey, row.exId, row.entry);
        } else if (row.type === "lastWorkout" && writers.writeLastWorkout) {
          await writers.writeLastWorkout(row.userKey, row.data);
        } else {
          continue;
        }
        await removeQueueItem(row.id);
        synced += 1;
      } catch (err) {
        console.warn("[offline] sync item failed", row.id, err);
        break; // stop on first failure; retry later
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, remaining: await pendingCount() };
}

export function onConnectivityChange({ onOnline, onOffline } = {}) {
  const up = () => onOnline?.();
  const down = () => onOffline?.();
  window.addEventListener("online", up);
  window.addEventListener("offline", down);
  return () => {
    window.removeEventListener("online", up);
    window.removeEventListener("offline", down);
  };
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    return reg;
  } catch (err) {
    console.warn("[offline] SW register failed", err);
    return null;
  }
}
