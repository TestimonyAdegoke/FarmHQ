const CACHE = "farmhq-shell-v2";
const SHELL = ["/", "/login", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const shouldPersist = url.pathname === "/field" || url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg";

  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (shouldPersist && response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          if (url.pathname === "/field") {
            const field = await caches.match("/field");
            if (field) return field;
          }
          return caches.match("/offline");
        }
        return Response.error();
      })
  );
});
