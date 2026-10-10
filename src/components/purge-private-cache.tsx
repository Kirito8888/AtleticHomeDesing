"use client";

import { useEffect } from "react";

/**
 * El service worker (public/sw.js) guarda el HTML de las páginas visitadas para
 * verlas sin conexión, y eso incluye finanzas y salud. Cualquier cierre de
 * sesión, revocación o borrado de cuenta termina en /login: al llegar aquí se
 * vacía esa caché (solo se conserva /offline). Se hace desde la página, sin
 * depender de que el service worker esté activo.
 */
export function PurgePrivateCache() {
  useEffect(() => {
    if (!("caches" in window)) return;
    const purge = async () => {
      try {
        for (const name of await caches.keys()) {
          if (!name.endsWith("-pages")) continue;
          const cache = await caches.open(name);
          for (const req of await cache.keys()) {
            if (new URL(req.url).pathname !== "/offline") await cache.delete(req);
          }
        }
        // v1.8 · ficheros compartidos sin usar (después: lo urgente son las páginas privadas)
        await caches.delete("lifeos-share");
      } catch {
        // Sin acceso a Cache Storage (modo privado): no hay nada que borrar.
      }
    };
    // El service worker guarda la página en segundo plano: una escritura puede llegar justo
    // después de la primera pasada, así que se repite una vez.
    void purge().then(() => new Promise((r) => setTimeout(r, 500))).then(purge);
  }, []);
  return null;
}
