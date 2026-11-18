"use client";

import { useEffect } from "react";

import { purgePrivateCaches } from "@/lib/offline/private-cache";

/**
 * Cualquier cierre de sesión, revocación o borrado de cuenta termina en /login: al llegar aquí se
 * vacía la caché privada del service worker (ver `purgePrivateCaches`).
 */
export function PurgePrivateCache() {
  useEffect(() => {
    void purgePrivateCaches();
  }, []);
  return null;
}
