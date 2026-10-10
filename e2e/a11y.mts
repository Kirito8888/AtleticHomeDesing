// v1.8 · Accesibilidad (WCAG 2.1 A/AA) con axe. Devuelve las violaciones serias o críticas como texto.
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright-core";

export async function a11y(page: Page, where: string): Promise<string[]> {
  // Se mide el estado final: sin el ratón encima de nada (hover) y con las transiciones y los fundidos
  // (avisos, botones) terminados. Medidos a medias, los colores salen mezclados y el contraste, más bajo.
  await page.mouse.move(0, 0);
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 5000 })
    .catch(() => undefined);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
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
