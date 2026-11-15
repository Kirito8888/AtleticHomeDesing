import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { checkTheme, cssVars, PAIRS, parseColor, ratio, THEMES } from "./contrast";

describe("contraste de tokens (v3.0 F)", () => {
  it("convierte OKLCH y hex a sRGB", () => {
    expect(ratio(parseColor("oklch(1 0 0)"), parseColor("oklch(0 0 0)"))).toBeCloseTo(21, 1);
    expect(ratio(parseColor("#777777"), parseColor("white"))).toBeCloseTo(4.48, 1);
    const g = parseColor("oklch(0.5 0 0)");
    expect(g.r).toBeCloseTo(g.g, 3);
    expect(parseColor("oklch(1 0 0 / 10%)").a).toBeCloseTo(0.1);
  });

  it("lee variables por selector exacto", () => {
    const css = ":root { --a: #fff; } .dark { --a: #000; } html.hc.dark { --a: #111; }";
    expect(cssVars(css, ":root").a).toBe("#fff");
    expect(cssVars(css, ".dark").a).toBe("#000");
    expect(cssVars(css, "html.hc.dark").a).toBe("#111");
  });

  it("globals.css cumple en los 4 temas salvo las excepciones documentadas", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const t of THEMES) {
      const vars = Object.assign({}, ...t.base.map((s) => cssVars(css, s)));
      const bad = checkTheme(vars, t.name, t.dark, PAIRS).filter((r) => !r.ok && !r.warn && !r.defer);
      expect(bad, t.name).toEqual([]);
    }
  });
});
