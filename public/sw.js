// Atlenza service worker — mínimo y conservador.
// - /_next/static e /icons: cache-first (ficheros con hash, inmutables).
// - Navegación: network-first; solo se guardan /offline y las páginas del plan del día
//   (PRECACHE_PATH: /training/<cuid> y /planning/plan/<cuid>): nunca finanzas, salud, el diario,
//   «nueva sesión» ni ninguna otra subruta fija. Sin red, la copia o /offline.
// - /api: nunca se cachea (datos personales y siempre frescos).
// v3.0 S (V3-S06): copias con TTL de 24 h; 401 o redirección a /login purgan las copias privadas.
// v4 (v2.11 B4-A · S2): al activarse borra lifeos-v3-pages, que pudo guardar subrutas fijas.
const VERSION = "lifeos-v4";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
// v1.8 · Ficheros recibidos con «Compartir» (los recoge la página /share; ver src/lib/share.ts)
const SHARE = "lifeos-share";
// Únicas páginas que se guardan para verlas sin red (sesiones y días del plan). Solo identificadores
// con forma cuid (@default(cuid())): /training/diary, /training/new, /planning/plan/new… nunca casan.
const PRECACHE_PATH = /^\/(training|planning\/plan)\/c[a-z0-9]{24}$/;
// v3.0 S · V3-S06: las copias privadas caducan a las 24 h (sello en una cabecera propia); sin sello = caducada.
const PRIVATE_TTL_MS = 24 * 60 * 60 * 1000;
const STAMP = "x-atlenza-cached-at";

function stamp(res) {
  const headers = new Headers(res.headers);
  headers.set(STAMP, String(Date.now()));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function isFresh(res, path) {
  if (path === "/offline") return true;
  const at = Number(res.headers.get(STAMP));
  const age = Date.now() - at;
  return Number.isFinite(at) && at > 0 && age < PRIVATE_TTL_MS && age > -60000;
}

// Borra todo lo privado (páginas salvo /offline y ficheros compartidos): sesión caducada o cerrada.
async function purgePrivate() {
  for (const name of await caches.keys()) {
    if (!name.endsWith("-pages")) continue;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) if (new URL(req.url).pathname !== "/offline") await cache.delete(req);
  }
  await caches.delete(SHARE);
}

// Borra las copias caducadas (o sin sello) de las páginas y los ficheros compartidos.
async function sweepExpired() {
  const pages = await caches.open(PAGES);
  for (const req of await pages.keys()) {
    const path = new URL(req.url).pathname;
    const res = await pages.match(req);
    if (!res || !isFresh(res, path)) await pages.delete(req);
  }
  if (await caches.has(SHARE)) {
    const share = await caches.open(SHARE);
    const items = await share.keys();
    for (const req of items) {
      const res = await share.match(req);
      if (!res || !isFresh(res, req.url)) {
        await caches.delete(SHARE);
        break;
      }
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add("/offline")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION) && k !== SHARE).map((k) => caches.delete(k)))).then(() => sweepExpired().catch(() => undefined)).then(() => self.clients.claim()),
  );
});

// v1.8 · share_target del manifest: se guardan los ficheros (máx. 10 y 30 MB) y se abre /share
async function receiveShare(req) {
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f) => f instanceof File).slice(0, 10);
    await caches.delete(SHARE);
    const cache = await caches.open(SHARE);
    let total = 0;
    for (const [i, f] of files.entries()) {
      total += f.size;
      if (total > 30 * 1024 * 1024) break;
      const headers = { "content-type": f.type || "application/octet-stream", "x-name": encodeURIComponent(f.name.slice(0, 200)), [STAMP]: String(Date.now()) };
      await cache.put(`/__shared/${i}`, new Response(f, { headers }));
    }
  } catch {
    // Sin ficheros legibles: /share lo indica
  }
  return Response.redirect("/share", 303);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method === "POST" && new URL(req.url).pathname === "/share") {
    event.respondWith(receiveShare(req));
    return;
  }
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
      (async () => {
        let res;
        try {
          res = await fetch(req);
        } catch {
          const hit = await caches.match(req);
          if (hit && isFresh(hit, url.pathname)) return hit;
          if (hit) await sweepExpired().catch(() => undefined);
          return (await caches.match("/offline")) ?? Response.error();
        }
        // Sesión caducada (401) o redirigida a /login: no queda nada privado legible en este dispositivo
        if (res.status === 401 || (res.redirected && new URL(res.url).pathname === "/login")) {
          event.waitUntil(purgePrivate().catch(() => undefined));
        } else if (res.ok && !res.redirected && PRECACHE_PATH.test(url.pathname)) {
          const copy = stamp(res.clone());
          event.waitUntil(caches.open(PAGES).then((c) => c.put(req, copy)));
        }
        return res;
      })(),
    );
  }
});

// Plan del día sin conexión: la app pide guardar las páginas de las sesiones de
// hoy y mañana (para la pista sin cobertura). Van a la misma caché de páginas,
// que se vacía al cerrar sesión (PurgePrivateCache).
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "purge") {
    event.waitUntil(purgePrivate().catch(() => undefined));
    return;
  }
  if (!data || data.type !== "precache" || !Array.isArray(data.paths)) return;
  const paths = data.paths.filter((p) => typeof p === "string" && PRECACHE_PATH.test(p)).slice(0, 8);
  event.waitUntil(
    sweepExpired().catch(() => undefined).then(() => caches.open(PAGES)).then((cache) =>
      Promise.all(
        paths.map((p) =>
          fetch(p, { credentials: "same-origin" })
            .then((res) => (res.ok && !res.redirected ? cache.put(new Request(new URL(p, self.location.origin).href), stamp(res)) : undefined))
            .catch(() => undefined),
        ),
      ),
    ),
  );
});

// Notificaciones push (src/lib/push). El servidor envía {title, body, url, tag}.
self.addEventListener("push", (event) => {
  let msg = { title: "Atlenza", body: "" };
  try {
    msg = event.data ? event.data.json() : msg;
  } catch {
    msg.body = event.data ? event.data.text() : "";
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "Atlenza", {
      body: msg.body,
      tag: msg.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: typeof msg.url === "string" && msg.url.startsWith("/") ? msg.url : "/", logId: typeof msg.logId === "string" ? msg.logId : null },
      // v1.8 · posponer (no en las urgentes: el servidor no manda logId)
      actions: typeof msg.logId === "string" ? [{ action: "snooze", title: "Recordar en 1 h" }] : [],
    }),
  );
});

// Al tocarla: enfocar una pestaña de Atlenza (o abrir una) en la ruta indicada.
// V3-S07: solo rutas propias («/x»); «//otro», «/\\otro», URL absolutas o cualquier otra cosa → «/».
function safeNotificationPath(raw) {
  if (typeof raw !== "string" || raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\" || raw.includes("\\")) return "/";
  try {
    return new URL(raw, self.location.origin).origin === self.location.origin ? raw : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "snooze" && event.notification.data?.logId) {
    event.waitUntil(
      fetch("/api/push/snooze", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: event.notification.data.logId }) }).catch(() => undefined),
    );
    return;
  }
  const url = new URL(safeNotificationPath(event.notification.data?.url), self.location.origin).href;
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
