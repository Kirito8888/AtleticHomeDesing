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
    // v1.6
    const exam = await prisma.classSlot.create({ data: { userId: from, subject: "Cálculo", kind: "EXAM", date: new Date("2026-10-20"), startMin: 540, endMin: 660 } });
    await prisma.studyPlanBlock.create({ data: { userId: from, examId: exam.id, subject: "Cálculo", date: new Date("2026-10-18"), minutes: 60, done: true } });
    await prisma.recipe.create({ data: { userId: from, name: "Arroz", servings: 2, items: [{ name: "Arroz", grams: 200, kcal100: 350, protein100: 7, carbs100: 77, fat100: 1 }] } });
    await prisma.grade.create({ data: { userId: from, subject: "Anatomía", grade: 8, credits: 6 } });
    const pr = await prisma.prehabRoutine.create({ data: { userId: from, name: "Hombro", exercises: [{ name: "Rotación externa", dose: "3×15" }] } });
    await prisma.prehabLog.create({ data: { userId: from, routineId: pr.id, date: new Date("2026-10-01") } });
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
    expect(r.counts).toMatchObject({ "plan de estudio": 1, recetas: 1, notas: 1, prehabilitación: 1 });
    const [slot, block] = await Promise.all([prisma.classSlot.findFirstOrThrow({ where: { userId: to } }), prisma.studyPlanBlock.findFirstOrThrow({ where: { userId: to } })]);
    expect(block).toMatchObject({ examId: slot.id, done: true });
    expect(await prisma.prehabLog.count({ where: { userId: to } })).toBe(1);
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
