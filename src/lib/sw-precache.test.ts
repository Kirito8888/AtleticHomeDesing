import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// v2.11 B4-A · S2: el service worker solo guarda sesiones/días del plan por id, nunca subrutas fijas.
const src = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const literal = /const PRECACHE_PATH = (\/.+\/);/.exec(src)?.[1];
const PRECACHE_PATH = new RegExp(literal!.slice(1, -1));
const CUID = "cm1abcdefghijklmnopqrstuv";

describe("sw.js · PRECACHE_PATH", () => {
  it("existe y casa las páginas del plan del día", () => {
    expect(literal).toBeTruthy();
    expect(PRECACHE_PATH.test(`/training/${CUID}`)).toBe(true);
    expect(PRECACHE_PATH.test(`/planning/plan/${CUID}`)).toBe(true);
  });

  it("no casa ninguna subruta fija de Entreno ni de Plan (se lee de las carpetas, así una nueva falla sola)", () => {
    const fixed = (dir: string) => readdirSync(join(process.cwd(), dir), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("(")).map((d) => d.name);
    const training = fixed("src/app/(app)/training");
    const plan = fixed("src/app/(app)/planning/plan");
    expect(training).toContain("diary");
    expect(plan).toContain("new");
    for (const n of training) expect(PRECACHE_PATH.test(`/training/${n}`), `/training/${n}`).toBe(false);
    for (const n of plan) expect(PRECACHE_PATH.test(`/planning/plan/${n}`), `/planning/plan/${n}`).toBe(false);
  });

  it("no casa otras áreas, sufijos ni consultas", () => {
    for (const p of ["/finance", `/finance/${CUID}`, `/recovery/${CUID}`, `/training/${CUID}/edit`, `/training/${CUID}?x=1`, `/training/${CUID}/`, "/training", "/offline"]) expect(PRECACHE_PATH.test(p), p).toBe(false);
  });

  it("la versión de la caché cambió para purgar copias antiguas", () => {
    expect(/const VERSION = "lifeos-v([0-9]+)"/.exec(src)?.[1]).not.toBe("3");
  });
});
