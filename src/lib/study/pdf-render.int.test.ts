// @vitest-environment node
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildManualPdf, pageTexts, renderPdf } from "./pdf-render";
import { allCodes, fakeManual, locateCodes, manualAiSchema, normalizeManual } from "./practical-manual";

const hasChromium = Boolean(process.env.CHROMIUM_PATH) || existsSync("/opt/pw-browsers");

describe.skipIf(!hasChromium)("renderizador PDF", () => {
  it("renderiza HTML simple a un PDF A4", async () => {
    const pdf = await renderPdf("<html><body><p>Hola</p></body></html>");
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await pageTexts(pdf)).join("")).toContain("Hola");
  }, 60_000);

  it("el índice lleva la página real de cada receta", async () => {
    const m = normalizeManual(manualAiSchema.parse(fakeManual("fuente de prueba para el manual práctico")));
    const pdf = await buildManualPdf(m);
    const texts = await pageTexts(pdf);
    const real = locateCodes(texts, allCodes(m));
    expect(real.size).toBe(3);
    // el índice por tareas (pág. 2) cita «[A1] … <pág>» con el número real
    const idx = texts[1];
    for (const [code, page] of real) expect(idx).toMatch(new RegExp(`\\[${code}\\][^\\[]*?${page}`));
    expect(texts.at(-1)).toContain("Índice alfabético");
  }, 90_000);
});
