// v3.0 F · V3-A03: ningún tamaño de letra fijo en px fuera de SVG (no escalaría con fontScale ni con la fuente
// del sistema). Usa la escala (`text-2xs` = 11 px a 100 %, `text-xs`…) o rem. El texto de un <svg> escala con su viewBox.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx|ts)$/.test(f) && !f.includes(".test.") ? [p] : [];
  });
}

describe("tamaños de letra que escalan", () => {
  it("sin text-[Npx] fuera de <text> de SVG", () => {
    const bad: string[] = [];
    for (const f of files("src"))
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((l, i) => {
          if (/text-\[\d+(\.\d+)?px\]/.test(l) && !/<text\b/.test(l)) bad.push(`${f}:${i + 1}`);
        });
    expect(bad).toEqual([]);
  });
});
