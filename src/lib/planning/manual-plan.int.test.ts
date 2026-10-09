// Integración con BD real: plan propio (crear, editar, duplicar, activar), mover sesiones y plan frente a hecho.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("plan propio y sesiones (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./manual-plan");
  let userId: string;

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./manual-plan");
    userId = (await prisma.user.create({ data: { email: `man-${Date.now()}@test.dev` } })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("crea, rellena, duplica la semana y activa", async () => {
    const { code } = await svc.createManualPlan(userId, { name: "Pretemporada", start: "2026-10-12", weeks: 2, weekdays: [0, 3], type: "STRENGTH" });
    const days = await prisma.planDay.findMany({ where: { userId }, orderBy: { date: "asc" } });
    expect(days.map((d) => d.date!.toISOString().slice(0, 10))).toEqual(["2026-10-12", "2026-10-15", "2026-10-19", "2026-10-22"]);
    await svc.updateManualDay(userId, days[0].id, {
      title: "Fuerza A",
      durationMin: 60,
      type: "STRENGTH",
      notes: "Calentamiento 10′",
      rows: [{ exercise: "Sentadilla trasera", sets: "3 × 5", load: "80 kg", rir: "2", rest: "2′", how: "" }],
    });
    expect(await svc.duplicateWeek(userId, code, 1)).toEqual({ copied: 2 });
    const copy = await prisma.planDay.findFirstOrThrow({ where: { userId, date: new Date("2026-10-19") } });
    expect(copy.title).toBe("Fuerza A");
    const { activateAiPlan } = await import("@/lib/ai-plan/service");
    expect((await activateAiPlan(userId, code)).sessionsCreated).toBe(4);
  });

  it("mover una sesión planificada mueve su día del plan; duplicar crea otra", async () => {
    const { moveSession } = await import("@/lib/training/move-service");
    const day = await prisma.planDay.findFirstOrThrow({ where: { userId, date: new Date("2026-10-12") } });
    const r = await moveSession(userId, day.sessionId!, { date: "2026-10-13", copy: false });
    expect(r.id).toBe(day.sessionId);
    expect((await prisma.planDay.findUniqueOrThrow({ where: { id: day.id } })).date!.toISOString().slice(0, 10)).toBe("2026-10-13");
    const c = await moveSession(userId, day.sessionId!, { date: "2026-10-14", copy: true });
    expect(c.id).not.toBe(day.sessionId);
  });

  it("plan frente a hecho de la sesión registrada", async () => {
    const day = await prisma.planDay.findFirstOrThrow({ where: { userId, date: new Date("2026-10-13") } });
    const squat = await prisma.exercise.findFirst({ where: { name: { contains: "Sentadilla trasera", mode: "insensitive" }, userId: null } });
    if (!squat) return; // catálogo sin sembrar en esta BD
    const { updateTrainingSession } = await import("@/lib/training/service");
    await updateTrainingSession(userId, day.sessionId!, {
      date: "2026-10-13",
      type: "STRENGTH",
      status: "COMPLETED",
      strength: { sets: [1, 2].map(() => ({ exerciseId: squat.id, reps: 5, weightKg: 80, isWarmup: false })) },
    } as never);
    const { sessionPlanVsDone } = await import("@/lib/training/plan-vs-done-service");
    const rows = (await sessionPlanVsDone(userId, day.sessionId!))!;
    expect(rows[0]).toMatchObject({ plan: { sets: 3, tonnage: 1200 }, done: { sets: 2, tonnage: 800 }, tonnagePct: -33 });
  });
});
