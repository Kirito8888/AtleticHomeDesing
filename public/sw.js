// LifeOS service worker — mínimo y conservador.
// - /_next/static e /icons: cache-first (ficheros con hash, inmutables).
// - Navegación: network-first; sin red, la última versión cacheada de esa página
//   o la página /offline.
// - /api: nunca se cachea (datos personales y siempre frescos).
const VERSION = "lifeos-v2";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add("/offline")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) ?? (await caches.match("/offline")) ?? Response.error()),
    );
  }
});

// Notificaciones push (src/lib/push). El servidor envía {title, body, url, tag}.
self.addEventListener("push", (event) => {
  let msg = { title: "LifeOS", body: "" };
  try {
    msg = event.data ? event.data.json() : msg;
  } catch {
    msg.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "LifeOS", {
      body: msg.body,
      tag: msg.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: typeof msg.url === "string" && msg.url.startsWith("/") ? msg.url : "/" },
    }),
  );
});

// Al tocarla: enfocar una pestaña de LifeOS (o abrir una) en la ruta indicada.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
