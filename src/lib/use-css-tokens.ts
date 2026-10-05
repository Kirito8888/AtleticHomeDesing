"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  return () => obs.disconnect();
}

/**
 * Lee variables CSS resueltas y se vuelve a leer cuando next-themes cambia la
 * clase de <html>. Recharts pinta atributos SVG, donde var(--x) no es fiable.
 * Devuelve null en el servidor (render de esqueleto).
 */
export function useCssTokens<const T extends readonly string[]>(tokens: T): Record<T[number], string> | null {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => {
      const cs = getComputedStyle(document.documentElement);
      return tokens.map((t) => cs.getPropertyValue(t).trim()).join("|");
    },
    () => "",
  );
  if (!snapshot) return null;
  const values = snapshot.split("|");
  return Object.fromEntries(tokens.map((t, i) => [t, values[i]])) as Record<T[number], string>;
}
