// @vitest-environment node
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildManualPdf, createPdfQueue, pageTexts, renderPdf } from "./pdf-render";
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

// Cola de PDF acotada (v2.11 B3 · O17): sin Chromium, con un render falso de duración controlada.
describe("cola del renderizador PDF", () => {
  const manual = () => normalizeManual(manualAiSchema.parse(fakeManual("fuente de prueba para la cola de PDF")));
  const gate = () => {
    let open!: () => void;
    const p = new Promise<void>((r) => (open = r));
    return { p, open };
  };

  it("dos manuales simultáneos se encolan sin pisarse", async () => {
    const q = createPdfQueue();
    const trace: string[] = [];
    const mk = (name: string) => async (html: string) => {
      trace.push(`${name}:ini`);
      await new Promise((r) => setTimeout(r, 15));
      trace.push(`${name}:fin`);
      return new TextEncoder().encode(html);
    };
    const [a, b] = await Promise.allSettled([buildManualPdf(manual(), mk("A"), q), buildManualPdf(manual(), mk("B"), q)]);
    // pageTexts no entiende el PDF falso: lo que importa es el orden; ambos terminan (con éxito o con el mismo error de lectura)
    expect([a.status, b.status]).toEqual([a.status, a.status]);
    const firstB = trace.indexOf("B:ini");
    const lastA = trace.lastIndexOf("A:fin");
    expect(lastA).toBeLessThan(firstB);
    expect(q.stats()).toEqual({ running: false, waiting: 0 });
  });

  it("con 1 en curso y 3 esperando, el siguiente recibe 503 al instante", async () => {
    const q = createPdfQueue({ maxWaiting: 3, timeoutMs: 5_000 });
    const g = gate();
    const jobs = [q.run(() => g.p), q.run(async () => 1), q.run(async () => 2), q.run(async () => 3)];
    expect(q.stats()).toEqual({ running: true, waiting: 3 });
    expect(() => q.assertCapacity()).toThrow(/ocupado/);
    await expect(q.run(async () => 4)).rejects.toMatchObject({ status: 503 });
    g.open();
    expect(await Promise.all(jobs)).toEqual([undefined, 1, 2, 3]);
    expect(q.stats()).toEqual({ running: false, waiting: 0 });
    expect(() => q.assertCapacity()).not.toThrow();
  });

  it("libera el turno aunque el trabajo falle", async () => {
    const q = createPdfQueue();
    const bad = q.run(async () => {
      throw new Error("boom");
    });
    const next = q.run(async () => "ok");
    await expect(bad).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
    expect(q.stats()).toEqual({ running: false, waiting: 0 });
  });

  it("503 si la espera en cola pasa del tiempo máximo, y la cola queda limpia", async () => {
    const q = createPdfQueue({ maxWaiting: 3, timeoutMs: 30 });
    const g = gate();
    const first = q.run(() => g.p);
    const late = q.run(async () => 1);
    await expect(late).rejects.toMatchObject({ status: 503 });
    expect(q.stats()).toEqual({ running: true, waiting: 0 });
    g.open();
    await first;
    expect(q.stats()).toEqual({ running: false, waiting: 0 });
  });
});
