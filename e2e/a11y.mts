// v1.8 · Accesibilidad (WCAG 2.1 A/AA) con axe. Devuelve las violaciones serias o críticas como texto.
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright-core";

export async function a11y(page: Page, where: string): Promise<string[]> {
  // Los avisos (sonner) entran con un fundido: medidos a medias, el contraste sale más bajo que el real
  await page
    .waitForFunction(() => [...document.querySelectorAll("[data-sonner-toast]")].every((t) => getComputedStyle(t).opacity === "1"), null, { timeout: 5000 })
    .catch(() => undefined);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${where}: ${v.id} (${v.impact}) ×${v.nodes.length} → ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
}
