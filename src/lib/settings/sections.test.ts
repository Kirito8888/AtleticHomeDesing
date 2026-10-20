import { describe, expect, it } from "vitest";

import { SETTINGS_GROUPS, settingsGroups } from "./sections";

describe("settingsGroups", () => {
  it("no repite secciones ni grupos", () => {
    const all = SETTINGS_GROUPS.flatMap((g) => g.sections);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(SETTINGS_GROUPS.map((g) => g.id)).size).toBe(SETTINGS_GROUPS.length);
  });
  it("la administración solo aparece para ADMIN", () => {
    expect(settingsGroups("ATHLETE").some((g) => g.id === "admin")).toBe(false);
    expect(settingsGroups("COACH").some((g) => g.id === "admin")).toBe(false);
    expect(settingsGroups("ADMIN").some((g) => g.id === "admin")).toBe(true);
  });
  it("conserva las anclas que usan otros enlaces", () => {
    const all = SETTINGS_GROUPS.flatMap((g) => g.sections);
    for (const a of ["entrenadora", "mis-reglas", "pista", "notificaciones", "modulos", "strava", "ia", "entreno-sola"]) expect(all).toContain(a);
  });
});
