"use client";

import { useEffect } from "react";

/**
 * Pide al service worker que guarde las páginas de las sesiones de hoy y
 * mañana para verlas sin cobertura. Se borran al cerrar sesión con el resto de
 * la caché privada.
 */
export function OfflineDayCache({ paths }: { paths: string[] }) {
  const key = paths.join("|");
  useEffect(() => {
    if (!key || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: "precache", paths: key.split("|") })).catch(() => {});
  }, [key]);
  return null;
}
