/* Service worker for the Biocatalyst India PWA (Milestone 8).
 *
 * Strategy:
 *  - Static assets (/_next/static, /icons, /manifest.webmanifest): cache-first.
 *  - API requests (/api/): never intercepted — always fresh from the network.
 *  - Navigations: network first, fall back to the cache, and finally the
 *    /offline fallback page when the device is offline.
 *
 * Zero third-party requests are ever made by this worker (no analytics).
 */
const STATIC_CACHE = "biocatalyst-static-v2";
const OFFLINE_URL = "/offline";
const PRECACHE = ["/", "/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return; // always fresh API data

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest";

  if (isStatic) {
    // Cache-first for immutable versioned assets and icons.
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        });
      }),
    );
    return;
  }

  // Navigations and other same-origin GETs: network first, fall back to the
  // cache, and finally the offline page for navigations.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === "navigate" || request.destination === "document") {
            return caches.match(OFFLINE_URL);
          }
          throw new Error("offline and not cached");
        }),
      ),
  );
});
