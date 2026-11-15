// v3.0 F · V3-A04: movimiento reducido. CSS global en globals.css y gráficos de recharts en «auto»
// (recharts ≥ 3 lee prefers-reduced-motion): nadie debe forzar la animación.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : [];
  });

describe("prefers-reduced-motion", () => {
  it("globals.css lo aplica a todo (animaciones, transiciones y desplazamiento)", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    for (const rule of ["animation-duration: 0.01ms !important", "transition-duration: 0.01ms !important", "scroll-behavior: auto !important"]) expect(block).toContain(rule);
  });

  it("ningún gráfico fuerza isAnimationActive ni hay scroll suave fijo", () => {
    const bad = files("src").filter((f) => {
      const s = readFileSync(f, "utf8");
      return /isAnimationActive(=\{(?!false\})|\s*:\s*true)/.test(s) || /behavior:\s*["']smooth["']/.test(s);
    });
    expect(bad).toEqual([]);
  });
});
