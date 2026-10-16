import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { performanceSectionOrder, TESTS_TABS, testsTabActive, trainingHubSections } from "./hub-links";

const route = (href: string) => existsSync(join(process.cwd(), "src/app/(app)", href, "page.tsx"));

describe("accesos de entrenamiento v2.3 B2", () => {
  it("agrupa en «Medir y analizar» y «Planificar y biblioteca»", () => {
    const s = trainingHubSections("sprint");
    expect(s.map((x) => x.id)).toEqual(["measure", "plan"]);
    expect(s[0].links.map((l) => l.href)).toContain("/training/tests/salto");
    expect(s[0].links.map((l) => l.href)).toContain("/training/performance");
  });

  it("la jabalina solo aparece para quien lanza", () => {
    const has = (f: Parameters<typeof trainingHubSections>[0]) => trainingHubSections(f).some((s) => s.links.some((l) => l.href === "/training/javelin"));
    expect(has("throws")).toBe(true);
    expect(has("jumps")).toBe(false);
    expect(has("other")).toBe(false);
  });

  it("todos los destinos son únicos y existen como página", () => {
    const all = [...trainingHubSections("throws").flatMap((s) => s.links.map((l) => l.href)), ...TESTS_TABS.map((t) => t.href)];
    const hub = trainingHubSections("throws").flatMap((s) => s.links.map((l) => l.href));
    expect(new Set(hub).size).toBe(hub.length);
    for (const h of all) expect(route(h), h).toBe(true);
  });

  it("pestaña activa de tests: Resultados exacto, el resto por prefijo", () => {
    expect(testsTabActive("/training/tests")).toBe("/training/tests");
    expect(testsTabActive("/training/tests/")).toBe("/training/tests");
    expect(testsTabActive("/training/tests/salto")).toBe("/training/tests/salto");
    expect(testsTabActive("/training/tests/curvas")).toBe("/training/tests/curvas");
    expect(testsTabActive("/training/tests/comparar")).toBe("/training/tests/comparar");
    expect(testsTabActive("/training/rm")).toBeNull();
  });

  it("métricas: lo de su prueba primero, siempre las cuatro secciones", () => {
    expect(performanceSectionOrder("throws")).toEqual(["load", "throws", "season", "strength"]);
    expect(performanceSectionOrder("sprint")).toEqual(["load", "strength", "throws", "season"]);
    for (const f of ["throws", "jumps", "endurance"] as const) expect(new Set(performanceSectionOrder(f)).size).toBe(4);
  });
});
