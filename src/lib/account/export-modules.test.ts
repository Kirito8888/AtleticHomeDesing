import { describe, expect, it } from "vitest";

import { AUTHORSHIP_NOTICE } from "@/lib/legal/notice";

import { EXPORT_MODULE_KEYS, EXPORT_MODULES, ExportQueryError, exportQuery, parseExportQuery, shapeExport } from "./export-modules";

const q = (s: string) => parseExportQuery(new URLSearchParams(s));

describe("exportación guiada · consulta", () => {
  it("sin módulos: todos, y sin lo cifrado", () => {
    expect(q("")).toEqual({ modules: [...EXPORT_MODULE_KEYS], sensitive: false });
  });
  it("módulos elegidos (en el orden del catálogo, sin repetir) y lo cifrado solo con sensitive=1", () => {
    expect(q("modules=study,finance,finance")).toEqual({ modules: ["finance", "study"], sensitive: false });
    expect(q("modules=finance&sensitive=1").sensitive).toBe(true);
    expect(q("modules=finance&sensitive=true").sensitive).toBe(false);
  });
  it("desconocidos o vacío → error", () => {
    expect(() => q("modules=finance,hacker")).toThrow(ExportQueryError);
    expect(() => q("modules=")).toThrow(/al menos un módulo/);
  });
  it("exportQuery y parseExportQuery son inversas", () => {
    const sel = { modules: ["training", "coach"] as never, sensitive: true };
    expect(q(exportQuery(sel))).toEqual(sel);
  });
  it("cada módulo explica qué incluye y las secciones no se repiten", () => {
    const all = EXPORT_MODULES.flatMap((m) => m.sections);
    expect(new Set(all).size).toBe(all.length);
    for (const m of EXPORT_MODULES) expect(m.includes.length).toBeGreaterThan(0);
  });
});

describe("exportación guiada · recorte", () => {
  const full = {
    exportedAt: "x",
    format: "lifeos-export/2",
    user: { id: "u" },
    security: {},
    privacy: {},
    app: {},
    training: { sessions: [1] },
    finance: { accounts: [1] },
    nutrition: {},
    recovery: { metrics: [1], menstrualCycle: { a: 1 }, womenHealth: {}, wellbeing: [1], bodyComposition: [1], safety: {} },
    appleHealth: {},
    goals: {},
  };
  it("pie de autoría idéntico y selección anotada", () => {
    const out = shapeExport(full, { modules: ["finance"], sensitive: false });
    expect(out.notice).toBe(AUTHORSHIP_NOTICE);
    expect(out.selection).toEqual({ modules: ["finance"], sensitive: false });
  });
  it("solo lo elegido y la cuenta", () => {
    const out = shapeExport(full, { modules: ["finance"], sensitive: false }) as Record<string, unknown>;
    expect(Object.keys(out).sort()).toEqual(["app", "exportedAt", "finance", "format", "notice", "privacy", "security", "selection", "user"]);
  });
  it("recuperación sin lo cifrado por defecto: las claves ni aparecen", () => {
    const rec = shapeExport(full, { modules: ["recovery"], sensitive: false }).recovery as Record<string, unknown>;
    expect(Object.keys(rec).sort()).toEqual(["metrics", "safety"]);
  });
  it("con sensitive entra lo cifrado, también sin el módulo de recuperación", () => {
    expect(Object.keys(shapeExport(full, { modules: ["recovery"], sensitive: true }).recovery as object)).toContain("wellbeing");
    expect(Object.keys(shapeExport(full, { modules: ["finance"], sensitive: true }).recovery as object).sort()).toEqual(["bodyComposition", "menstrualCycle", "wellbeing", "womenHealth"]);
  });
});
