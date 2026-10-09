// Integración con BD real: lo que se envía a la IA no lleva salud, notas ni nombre; el dictado se convierte sin IA.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("IA con tus datos (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let userId: string;

  beforeAll(async () => {
    process.env.LIFEOS_FAKE_AI = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    userId = (await prisma.user.create({ data: { email: `ai-${Date.now()}@test.dev`, name: "Nombre-Secreto" } })).id;
    await prisma.trainingSession.create({ data: { userId, date: new Date(), type: "STRENGTH", status: "COMPLETED", durationSec: 3600, sessionRpe: 7, notes: "NOTA-PRIVADA" } });
    await prisma.recoveryMetrics.create({ data: { userId, date: new Date(), squeezePain: 6, sleepHours: 5, bodyWeightKg: 66.6, notes: "SALUD-PRIVADA" } });
    await prisma.injury.create({ data: { userId, area: "KNEE", pain: 5, startedOn: new Date() } });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    delete process.env.LIFEOS_FAKE_AI;
  });

  it("el resumen solo lleva entrenamiento", async () => {
    const { trainingSummary } = await import("./data-ai");
    const json = JSON.stringify(await trainingSummary(userId));
    expect(json).toContain('"sesiones":1');
    expect(json).not.toMatch(/Nombre-Secreto|NOTA-PRIVADA|SALUD-PRIVADA|66\.6|squeeze|sleep|KNEE|rodilla|pain|dolor/i);
  });

  it("dictado → borrador con ejercicios del catálogo", async () => {
    const { voiceToDraft } = await import("./data-ai");
    const d = await voiceToDraft(userId, "press banca 4 por 6 con 60, ejercicio inventado 3x5, 45 minutos");
    expect(d.source).toBe("local");
    expect(d.durationMin).toBe(45);
    if (d.blocks.length) expect(d.blocks[0]).toMatchObject({ sets: 4, reps: 6, kg: 60 });
    expect(d.unmatched).toContain("ejercicio inventado");
  });
});
