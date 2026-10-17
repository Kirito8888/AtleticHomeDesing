// Integración con BD real (v2.4): perfil F-V guardado como entradas, recalculado al listar, privado de cada usuaria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const input = { date: "2026-10-17", bodyMassKg: 70, hpoCm: 41.37, loads: [{ addedKg: 0, heightCm: 30 }, { addedKg: 25, heightCm: 22 }, { addedKg: 50, heightCm: 15.5 }] };

describe.skipIf(!HAS_DB)("perfil F-V (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./fv-profile-service");
  let a: string;
  let b: string;

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./fv-profile-service");
    const t = Date.now();
    a = (await prisma.user.create({ data: { email: `fv-a-${t}@test.dev` } })).id;
    b = (await prisma.user.create({ data: { email: `fv-b-${t}@test.dev` } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b].filter(Boolean) } } });
  });

  it("guarda las entradas y lista el perfil recalculado", async () => {
    const r = await svc.createFvSeries(a, input);
    expect(r.profile.F0).toBeGreaterThan(9.81);
    const list = await svc.listFvSeries(a);
    expect(list).toHaveLength(1);
    const item = list[0];
    expect(item.date).toBe("2026-10-17");
    expect(item.loads).toHaveLength(3);
    expect(item.result.ok && item.result.profile.pmax).toBeCloseTo(r.profile.pmax, 9);
  });

  it("400 con el motivo si no hay perfil calculable (menos de 2 cargas, cargas iguales)", async () => {
    await expect(svc.createFvSeries(a, { ...input, loads: input.loads.slice(0, 1) })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/al menos 2/) });
    await expect(svc.createFvSeries(a, { ...input, loads: [{ addedKg: 10, heightCm: 30 }, { addedKg: 10, heightCm: 28 }] })).rejects.toMatchObject({ status: 400 });
    expect(await svc.listFvSeries(a)).toHaveLength(1);
  });

  it("es de cada usuaria: otra no lo ve ni lo borra (404); la dueña sí", async () => {
    const id = (await svc.listFvSeries(a))[0].id;
    expect(await svc.listFvSeries(b)).toHaveLength(0);
    await expect(svc.deleteFvSeries(b, id)).rejects.toMatchObject({ status: 404 });
    await svc.deleteFvSeries(a, id);
    expect(await svc.listFvSeries(a)).toHaveLength(0);
  });

  it("no va a la IA: el resumen de entrenamiento no lleva el perfil F-V", async () => {
    await svc.createFvSeries(a, input);
    const { trainingSummary } = await import("@/lib/ai/data-ai");
    const txt = JSON.stringify(await trainingSummary(a, "2026-10-17"));
    expect(txt).not.toContain("41.37");
    expect(txt.toLowerCase()).not.toMatch(/fvseries|perfil f-v|pmax/);
  });
});
