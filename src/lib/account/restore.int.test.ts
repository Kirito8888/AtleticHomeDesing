// Integración con BD real (v1.6): exportar una cuenta y restaurarla en otra vacía.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("restaurar una exportación (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let from: string;
  let to: string;

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    const t = Date.now();
    from = (await prisma.user.create({ data: { email: `rs1-${t}@test.dev` } })).id;
    to = (await prisma.user.create({ data: { email: `rs2-${t}@test.dev` } })).id;
    const { createTrainingSession } = await import("@/lib/training/service");
    await createTrainingSession(from, null, { date: "2026-10-01", type: "TECHNICAL", status: "COMPLETED", sessionRpe: 6, durationSec: 3600, technical: { event: "JAVELIN", implementWeightG: 800, isCompetition: false, attempts: [{ markM: 50.5, isFoul: false, isMeasured: true }] } } as never);
    await prisma.recoveryMetrics.create({ data: { userId: from, date: new Date("2026-10-01"), sleepHours: 7.5, readinessParts: { tsb: 1 } } });
    const h = await prisma.habit.create({ data: { userId: from, name: "Estirar" } });
    await prisma.habitLog.create({ data: { userId: from, habitId: h.id, date: new Date("2026-10-01") } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [from, to].filter(Boolean) } } });
  });

  it("restaura entrenos, recuperación y hábitos; no en una cuenta con datos", async () => {
    const { exportAccount } = await import("./service");
    const { restoreExport } = await import("./restore");
    const data = JSON.parse(JSON.stringify(await exportAccount(from)));
    const r = await restoreExport(to, data);
    expect(r.counts).toMatchObject({ sesiones: 1, "días de recuperación": 1, hábitos: 1 });
    const s = await prisma.trainingSession.findFirstOrThrow({ where: { userId: to }, include: { technical: true } });
    expect(s.technical?.bestMarkM).toBe(50.5);
    expect(await prisma.habitLog.count({ where: { userId: to } })).toBe(1);
    await expect(restoreExport(to, data)).rejects.toThrow(/cuenta vacía/);
    await expect(restoreExport(to, { format: "otro" })).rejects.toThrow(/lifeos-export/);
  });

  it("el registro sin conexión no duplica la sesión si se reenvía", async () => {
    const { createTrainingSession } = await import("@/lib/training/service");
    const input = { date: "2026-10-02", type: "STRENGTH", status: "COMPLETED", clientId: "abc12345-offline", strength: { sets: [] } } as never;
    const a = await createTrainingSession(to, null, input);
    const b = await createTrainingSession(to, null, input);
    expect(b.id).toBe(a.id);
    expect(await prisma.trainingSession.count({ where: { userId: to, clientId: "abc12345-offline" } })).toBe(1);
  });
});
