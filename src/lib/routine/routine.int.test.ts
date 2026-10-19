// Integración con BD real (v1.7): crear rutina (borrador), bloqueo por salud, retest y proyección.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { routineAnswersSchema } from "./questionnaire";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("rutinas del cuestionario (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let userId: string;
  const answers = routineAnswersSchema.parse({
    sex: "M",
    age: 41,
    experience: "retomo",
    activity: "ligera",
    tests: { pushups: 12, squats60: 30 },
    shortGoal: "fuerza",
    shortWeeks: 6,
    longGoal: "fuerza",
    horizonMonths: 6,
    weekdays: [2, 4],
    minutes: 60,
    locations: ["pista", "gimnasio"],
    dayLocations: [["pista", "gimnasio"], ["gimnasio"]],
    startDate: "2026-10-12",
  });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./service");
    userId = (await prisma.user.create({ data: { email: `rt-${Date.now()}@test.dev` } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("crea el borrador RT1 con días, sin activar nada, y guarda los tests iniciales", async () => {
    const r = await svc.createRoutine(userId, answers, "2026-10-09");
    expect(r).toMatchObject({ code: "RT1", warnings: [] });
    const meso = await prisma.planMeso.findUniqueOrThrow({ where: { userId_code: { userId, code: "RT1" } } });
    expect(meso).toMatchObject({ source: "ROUTINE", status: "DRAFT" });
    expect(await prisma.planDay.count({ where: { mesoId: meso.id } })).toBe(12); // 6 semanas × 2 días
    expect(await prisma.trainingSession.count({ where: { userId } })).toBe(0);
    // varios espacios: se guardan y el plan lo dice día a día (martes: pista + gimnasio; jueves: solo gimnasio)
    const saved = await prisma.routineProfile.findUniqueOrThrow({ where: { id: r.id } });
    expect(saved.answers).toMatchObject({ locations: ["pista", "gimnasio"], dayLocations: [["pista", "gimnasio"], ["gimnasio"]] });
    const where = JSON.stringify(await prisma.planDay.findMany({ where: { mesoId: meso.id }, orderBy: { date: "asc" }, take: 2 }));
    expect(where).toContain("Pista de atletismo + Gimnasio");

    await svc.addRoutineTest(userId, r.id, "pushups", 15, "2026-11-06");
    const v = await svc.routineView(userId, r.id);
    const push = v!.metrics.find((m) => m.key === "pushups")!;
    expect(push.real.map((x) => x.value)).toEqual([12, 15]);
    expect(push.curve.at(-1)!.week).toBe(v!.horizonWeeks);
    expect(push.longTerm.expected).toBeGreaterThan(12);
  });

  it("una rutina guardada con un solo `location` sigue abriéndose", async () => {
    const { locations, dayLocations, ...rest } = answers;
    void locations;
    void dayLocations;
    const old = await prisma.routineProfile.create({ data: { userId, mesoCode: "RT-OLD", answers: { ...rest, location: "casa" }, profile: { level: "principiante" } }, select: { id: true } });
    const v = await svc.routineView(userId, old.id);
    expect(v).not.toBeNull();
    expect(routineAnswersSchema.parse({ ...rest, location: "casa" }).locations).toEqual(["casa"]);
    await prisma.routineProfile.delete({ where: { id: old.id } });
  });

  it("con una respuesta de salud marcada no crea nada", async () => {
    await expect(svc.createRoutine(userId, { ...answers, parq: ["dolor_pecho"] }, "2026-10-09")).rejects.toThrow(/profesional sanitario/);
    expect(await prisma.routineProfile.count({ where: { userId } })).toBe(1);
  });
});
