"use client";

/**
 * El service worker (public/sw.js) guarda el HTML de las sesiones y días del plan para verlos sin
 * conexión y los ficheros recibidos con «Compartir». Se vacía (solo se conserva /offline) al cerrar
 * sesión, al detectar una sesión caducada (401) y, por TTL, desde el propio SW.
 * Se hace desde la página, sin depender de que el service worker esté activo, y además se le pide al SW.
 */
export async function purgePrivateCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) return;
  const purge = async () => {
    try {
      for (const name of await caches.keys()) {
        if (!name.endsWith("-pages")) continue;
        const cache = await caches.open(name);
        for (const req of await cache.keys()) {
          if (new URL(req.url).pathname !== "/offline") await cache.delete(req);
        }
      }
      await caches.delete("lifeos-share");
    } catch {
      // Sin acceso a Cache Storage (modo privado): no hay nada que borrar.
    }
  };
  try {
    if ("serviceWorker" in navigator) navigator.serviceWorker.controller?.postMessage({ type: "purge" });
  } catch {
    // sin service worker
  }
  // El SW guarda la página en segundo plano: una escritura puede llegar justo después, así que se repite una vez.
  await purge();
  await new Promise((r) => setTimeout(r, 500));
  await purge();
}
