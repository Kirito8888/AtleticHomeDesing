"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** v1.8 · Tamaño de letra y contraste alto (Ajustes → Accesibilidad), aplicados al documento. */
export function DisplayPrefs({ fontScale, highContrast }: { fontScale: number; highContrast: boolean }) {
  useEffect(() => {
    const html = document.documentElement;
    html.style.fontSize = fontScale === 100 ? "" : `${fontScale}%`;
    html.classList.toggle("hc", highContrast);
  }, [fontScale, highContrast]);
  return null;
}

/**
 * v1.8 · Uso local: avisa al servidor de la página abierta (solo el patrón de la ruta). Con la opción
 * desactivada no se manda nada. `sendBeacon` no bloquea la navegación.
 */
export function UsageBeacon({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!enabled || typeof navigator.sendBeacon !== "function") return;
    navigator.sendBeacon("/api/usage", new Blob([JSON.stringify({ path: pathname })], { type: "application/json" }));
  }, [enabled, pathname]);
  return null;
}
