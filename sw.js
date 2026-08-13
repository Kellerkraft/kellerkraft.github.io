/* Kellerkraft — Service Worker (offline training MVP) */
const CACHE_VERSION = "kg-offline-v34";
const PRECACHE = [
  "./",
  "./index.html",
  "./impressum.html",
  "./datenschutz.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/auth-ui.js",
  "./js/bodymap-assets.js",
  "./js/data.js",
  "./js/data-model.js",
  "./js/exercises.js",
  "./js/firebase.js",
  "./js/growth.js",
  "./js/mesocycle.js",
  "./js/offline.js",
  "./js/reservations.js",
  "./js/state.js",
  "./js/telemetry.js",
  "./js/training.js",
  "./js/ui.js",
  "./js/services/events.js",
  "./js/services/logs.js",
  "./js/services/plans.js",
  "./js/services/roles.js",
  "./js/services/schema.js",
  "./js/services/users.js",
  "./assets/manifest.json",
  "./assets/logo-light.png",
  "./assets/logo-dark.png",
  "./assets/logo-mark-light.png",
  "./assets/logo-mark-dark.png",
  "./assets/icon-192x192.png",
  "./assets/icon-32x32.png",
  "./assets/icon-16x16.png",
  "./assets/manifest-icon-512x512.png",
  "./assets/apple-touch-icon-180x180.png",
  "./assets/body-icon-arme.png",
  "./assets/body-icon-bauch.png",
  "./assets/body-icon-beine.png",
  "./assets/body-icon-brust.png",
  "./assets/body-icon-ruecken.png"
];

const CDN_PRECACHE = [
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(PRECACHE);
    await Promise.all(
      CDN_PRECACHE.map(async (url) => {
        try {
          const res = await fetch(url, { mode: "cors", credentials: "omit" });
          if (res.ok) await cache.put(url, res.clone());
        } catch {
          /* first install may miss CDN — runtime cache will fill later */
        }
      })
    );
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isNavigate(request) {
  return request.mode === "navigate" || (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  /* Never cache Firebase RTDB realtime traffic */
  if (url.hostname.includes("firebasedatabase.app") || url.hostname.includes("firebaseio.com")) {
    return;
  }
  if (url.hostname.includes("identitytoolkit.googleapis.com") || url.hostname.includes("securetoken.googleapis.com")) {
    return;
  }

  // App shell navigations: network first, fallback to cached index
  if (isNavigate(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_VERSION);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Same-origin static + Firebase/Chart CDNs: cache-first with revalidate
  const cacheable =
    url.origin === self.location.origin
    || url.hostname.includes("gstatic.com")
    || url.hostname.includes("jsdelivr.net")
    || url.hostname.includes("fonts.googleapis.com")
    || url.hostname.includes("fonts.gstatic.com");

  if (cacheable) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
        }).catch(() => {});
        return cached;
      }
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return Response.error();
      }
    })());
  }
});
