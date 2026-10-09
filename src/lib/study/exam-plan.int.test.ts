// Integración con BD real: plan de estudio hasta el examen, tachado por el pomodoro y sin tocar el plan de entreno.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("plan de estudio (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./exam-plan-service");
  let userId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./exam-plan-service");
    userId = (await prisma.user.create({ data: { email: `exp-${Date.now()}@test.dev` } })).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("genera bloques, los tacha el pomodoro y al rehacer conserva los hechos", async () => {
    const { createSlot } = await import("./schedule-service");
    const exam = await createSlot(userId, { kind: "EXAM", subject: "Cálculo", date: "2026-10-20", start: "09:00", end: "11:00" });
    const planned = await prisma.trainingSession.create({ data: { userId, date: new Date("2026-10-16"), type: "STRENGTH", status: "PLANNED", title: "Fuerza" } });
    const r = await svc.generateExamPlan(userId, "2026-10-15", { [exam.id]: 3 });
    expect(r.shortfall).toEqual([]);
    const blocks = await prisma.studyPlanBlock.findMany({ where: { userId } });
    expect(blocks.reduce((a, b) => a + b.minutes, 0)).toBe(180);
    expect(blocks.every((b) => b.date < new Date("2026-10-20"))).toBe(true);

    const first = blocks.sort((a, b) => a.date.getTime() - b.date.getTime())[0];
    await prisma.studySession.create({ data: { userId, subject: "Cálculo", date: first.date, minutes: first.minutes } });
    expect(await svc.tickStudyBlocks(userId, "Cálculo", first.date.toISOString().slice(0, 10))).toBe(1);

    await svc.generateExamPlan(userId, "2026-10-15", {});
    const again = await prisma.studyPlanBlock.findMany({ where: { userId } });
    expect(again.filter((b) => b.done).map((b) => b.id)).toEqual([first.id]);
    expect(again.reduce((a, b) => a + b.minutes, 0)).toBe(180);
    // el plan de entrenamiento no se toca
    expect(await prisma.trainingSession.findUnique({ where: { id: planned.id } })).toMatchObject({ status: "PLANNED", date: new Date("2026-10-16") });
  });
});
