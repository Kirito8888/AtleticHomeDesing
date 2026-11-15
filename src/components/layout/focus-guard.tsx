"use client";

import { useEffect } from "react";

/** Barras fijas que pueden tapar contenido en el móvil (la superior, la inferior y las de acción fija). */
export const OBSTRUCTIONS = 'header.sticky, nav[aria-label="Navegación principal"], [data-sticky-action]';

/**
 * Cuánto hay que desplazar para que `target` no quede debajo de ninguna barra de `bars` (las que lo
 * contienen no cuentan). Negativo = subir, positivo = bajar, 0 = ya está a la vista. Puro, para probarlo.
 */
export function obscuredShift(target: { top: number; bottom: number }, bars: readonly { top: number; bottom: number; edge: "top" | "bottom" }[], viewportH: number, gap = 8) {
  let topEdge = 0;
  let bottomEdge = viewportH;
  for (const b of bars) {
    if (b.bottom <= b.top) continue;
    if (b.edge === "top") topEdge = Math.max(topEdge, b.bottom);
    else bottomEdge = Math.min(bottomEdge, b.top);
  }
  if (target.bottom - target.top > bottomEdge - topEdge) return target.top < topEdge ? target.top - topEdge - gap : 0;
  if (target.top < topEdge) return target.top - topEdge - gap;
  if (target.bottom > bottomEdge) return target.bottom - bottomEdge + gap;
  return 0;
}

/**
 * v3.0 G · V3-A07 (WCAG 2.4.11 foco no oculto): `scroll-padding` (globals.css) cubre lo que el navegador
 * desplaza por sí mismo; esto recoloca el resto (foco que ya cae en pantalla pero bajo una barra).
 * Dentro de hojas y diálogos no actúa: ahí las barras quedan por debajo de la capa.
 */
export function FocusGuard() {
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLElement) || el.closest('[role="dialog"], [role="alertdialog"]')) return;
      const vh = window.innerHeight;
      const bars = [...document.querySelectorAll<HTMLElement>(OBSTRUCTIONS)]
        .filter((b) => !b.contains(el) && getComputedStyle(b).display !== "none")
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, edge: b.matches("header") ? ("top" as const) : ("bottom" as const), sticky: b.hasAttribute("data-sticky-action") };
        })
        // una barra de acción solo tapa cuando está pegada abajo (en su sitio del formulario no solapa nada)
        .filter((b) => !b.sticky || b.bottom > vh - 120);
      const dy = obscuredShift(el.getBoundingClientRect(), bars, vh);
      if (dy) window.scrollBy({ top: dy, behavior: "instant" });
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);
  return null;
}
