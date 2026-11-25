// v1.8 · Accesibilidad (WCAG 2.1 A/AA) con axe. Devuelve las violaciones serias o críticas como texto.
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright-core";

const WCAG21 = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
/** v3.0 F: WCAG 2.2 AA (añade target-size y demás reglas 2.2). Las suites anteriores siguen con WCAG21. */
export const WCAG22 = [...WCAG21, "wcag22aa"];

export async function a11y(page: Page, where: string, tags: string[] = WCAG21): Promise<string[]> {
  // Se mide el estado final: sin el ratón encima de nada (hover) y con las transiciones y los fundidos
  // (avisos, botones) terminados. Medidos a medias, los colores salen mezclados y el contraste, más bajo.
  await page.mouse.move(0, 0);
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 5000 })
    .catch(() => undefined);
  const r = await new AxeBuilder({ page }).withTags(tags).analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${where}: ${v.id} (${v.impact}) ×${v.nodes.length} → ${v.nodes
          .slice(0, 2)
          .map((n) => `${n.target.join(" ")} ${n.failureSummary?.match(/contrast of [^)]*\)/)?.[0] ?? ""}`.trim())
          .join(" | ")}`,
    );
}

/** Controles táctiles visibles de <main> por debajo de 44 px (la misma comprobación que v23b; casillas y radios
 *  los cubre su <label>; los enlaces en línea dentro de un párrafo no cuentan). */
export const smallTargets = (p: Page, root = "main") =>
  p.evaluate((root) =>
    [...document.querySelectorAll<HTMLElement>(["a", "button:not([role=switch])", "select", "summary", "input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file])", "[role=tab]"].map((t) => `${root} ${t}`).join(","))]
      .filter((e) => {
        if (e.tagName === "A" && e.closest("p")) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5;
      })
      .map((e) => `${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24)}@${Math.round(e.getBoundingClientRect().height)}`),
    root,
  );
