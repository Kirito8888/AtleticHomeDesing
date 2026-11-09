// Integración con BD real: composición corporal ISAK cifrada, solo para su dueña.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && Boolean(process.env.TOTP_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY);

const input = {
  date: "2026-11-09", sex: "F", weightKg: 62, heightCm: 168,
  triceps: 14, subscapular: 11, biceps: 6, iliacCrest: 13, supraspinale: 8, abdominal: 15, frontThigh: 18, medialCalf: 10,
  armFlexedGirth: 28, calfGirth: 35, humerusBreadth: 6.1, femurBreadth: 9, wristBreadth: 5,
};

describe.skipIf(!HAS_DB)("composición corporal ISAK (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./isak-service");
  let a: string;
  let b: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./isak-service");
    const t = Date.now();
    a = (await prisma.user.create({ data: { email: `isak-a-${t}@test.dev` } })).id;
    b = (await prisma.user.create({ data: { email: `isak-b-${t}@test.dev` } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  });

  it("guarda cifrado (ni medidas ni resultados en claro) y se lee de vuelta", async () => {
    await svc.saveBodyComposition(a, input);
    const raw = await prisma.bodyComposition.findMany({ where: { userId: a } });
    expect(raw).toHaveLength(1);
    // Texto cifrado (base64): se comprueba el formato del sobre y que no haya JSON ni nombres de campo,
    // nunca cifras sueltas (62 o 168 aparecerían por azar en el base64 y harían el test intermitente).
    expect(raw[0].data.startsWith("v1:")).toBe(true);
    expect(() => JSON.parse(raw[0].data)).toThrow();
    expect(raw[0].data).not.toMatch(/triceps|weightKg|somatotype|masses/);
    const { openJson } = await import("@/lib/security/data-key");
    expect(openJson<{ input: { weightKg: number } }>(raw[0].data).input.weightKg).toBe(62);
    const list = await svc.listBodyComposition(a);
    expect(list[0]).toMatchObject({ date: "2026-11-09", source: "manual" });
    expect(list[0].input.weightKg).toBe(62);
    expect(list[0].result.masses.fat.kg).toBeGreaterThan(0);
  });

  it("recalcula en el servidor: ignora un resultado enviado por el cliente", async () => {
    await svc.saveBodyComposition(a, { ...input, date: "2026-11-10", result: { masses: { fat: { kg: 999 } } } });
    const last = (await svc.listBodyComposition(a)).at(-1)!;
    expect(last.result.masses.fat.kg).toBeLessThan(62);
  });

  it("rechaza fuera de rango y registra el consentimiento de salud", async () => {
    await expect(svc.saveBodyComposition(a, { ...input, weightKg: 5 })).rejects.toThrow();
    const c = await prisma.consent.findFirst({ where: { userId: a, purpose: "HEALTH" }, orderBy: { createdAt: "desc" } });
    expect(c?.granted).toBe(true);
  });

  it("aislamiento: otra persona no ve ni borra", async () => {
    expect(await svc.listBodyComposition(b)).toEqual([]);
    const id = (await prisma.bodyComposition.findFirst({ where: { userId: a } }))!.id;
    await expect(svc.deleteBodyComposition(b, id)).rejects.toMatchObject({ status: 404 });
    await svc.deleteBodyComposition(a, id);
    expect(await prisma.bodyComposition.count({ where: { id } })).toBe(0);
  });

  it("importación: sin commit no guarda; con commit guarda solo las válidas", async () => {
    const json = JSON.stringify([{ ...input, date: "2026-10-01" }, { ...input, date: "2026-10-02", weightKg: 5 }]);
    const before = await prisma.bodyComposition.count({ where: { userId: b } });
    const prev = await svc.importBodyComposition(b, json, "json", false);
    expect(prev).toMatchObject({ total: 2, valid: 1, imported: 0 });
    expect(prev.rows[0].result?.somatotype.endo).toBeGreaterThan(0);
    expect(await prisma.bodyComposition.count({ where: { userId: b } })).toBe(before);
    const done = await svc.importBodyComposition(b, json, "json", true);
    expect(done.imported).toBe(1);
    expect((await svc.listBodyComposition(b))[0].source).toBe("import");
    await expect(svc.importBodyComposition(b, "[]", "json", true)).rejects.toMatchObject({ status: 400 });
  });

  it("la rotación de clave incluye la tabla", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/lib/security/rotate.ts", "utf8")).toMatch(/prisma\.bodyComposition\.update/);
  });

  it("se borra con la cuenta (cascade)", async () => {
    const c = (await prisma.user.create({ data: { email: `isak-c-${Date.now()}@test.dev` } })).id;
    await svc.saveBodyComposition(c, input);
    await prisma.user.delete({ where: { id: c } });
    expect(await prisma.bodyComposition.count({ where: { userId: c } })).toBe(0);
  });
});
