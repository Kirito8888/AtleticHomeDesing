// Integración con BD real: «Salud de la mujer» cifrada, solo para su dueña y fuera de la IA.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && Boolean(process.env.TOTP_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY);

describe.skipIf(!HAS_DB)("salud de la mujer (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./women-service");
  let userId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./women-service");
    userId = (await prisma.user.create({ data: { email: `women-${Date.now()}@test.dev`, athleteProfile: { create: { sex: "FEMALE" } } } })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("guarda cifrado (ni el tipo ni los valores en claro) y avisa", async () => {
    await svc.addHealthLog(userId, { kind: "LAB", date: "2026-10-01", values: { ferritin: 18 } });
    await svc.addHealthLog(userId, { kind: "PELVIC", date: "2026-10-06", symptoms: ["leakJump"] });
    const raw = await prisma.healthLog.findMany({ where: { userId } });
    expect(raw.map((r) => r.data).join(" ")).not.toMatch(/LAB|PELVIC|ferritin|leakJump|18/);
    const o = await svc.womenOverview(userId, "2026-10-07");
    expect(o.alerts.map((a) => a.id)).toEqual(expect.arrayContaining(["ferritin", "pelvic", "screen-due"]));
    expect(o.ea.ok).toBe(false);
  });

  it("modo posparto: bloquea la IA; borrar lo quita todo", async () => {
    await svc.saveWomenSettings(userId, { mode: "POSTPARTUM", postpartumSince: "2026-08-01" });
    expect(await svc.womenMode(userId)).toBe("POSTPARTUM");
    const { generateAiPlan } = await import("@/lib/ai-plan/service");
    const generate = async () => {
      throw new Error("no debería llamar a la IA");
    };
    await expect(generateAiPlan(userId, { safety: [] } as never, { generate: generate as never, assertAllowed: async () => {} })).rejects.toMatchObject({ status: 422 });
    const raw = await prisma.womenHealth.findUnique({ where: { userId } });
    expect(raw?.data).not.toMatch(/POSTPARTUM|2026-08-01/);
    await svc.deleteWomenData(userId);
    expect(await prisma.healthLog.count({ where: { userId } })).toBe(0);
    expect(await svc.womenMode(userId)).toBe("NONE");
  });
});
