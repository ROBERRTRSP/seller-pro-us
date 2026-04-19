/* Admin: caché de interfaz y estáticos de Next tras visitar con red. No cachea /api.
   Servido desde / sw-admin.js para no pasar por middleware /admin. */
const VERSION = "admin-offline-v3";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function sameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch {
    return (
      hit ||
      new Response("Recurso no disponible sin conexión.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function networkFirstAdmin(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      [
        "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>",
        "<title>Sin conexión · Admin</title>",
        "<style>body{font-family:system-ui,sans-serif;padding:2rem;background:#0a0a0a;color:#e5e5e5;line-height:1.5}a{color:#fbbf24}</style></head><body>",
        "<h1>Sin conexión</h1>",
        "<p>No hay copia en caché de esta vista. Conéctate al menos una vez para guardarla.</p>",
        "<p><a href=\"/admin\">Inicio del panel</a></p>",
        "</body></html>",
      ].join(""),
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (!sameOrigin(req.url)) return;

  const url = new URL(req.url);
  const path = url.pathname;

  if (path.startsWith("/_next/static") || path.startsWith("/_next/image")) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  if (path.startsWith("/admin")) {
    event.respondWith(networkFirstAdmin(req, PAGE_CACHE));
  }
});
