// Integración con BD real (v1.7): crear rutina (borrador), bloqueo por salud, retest y proyección.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PlanBlock } from "@/lib/planning/plan-import/types";

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

  it("el borrador guarda la justificación con citas; editar un día la conserva, y una rutina activa o ajena no se edita", async () => {
    const meso = await prisma.planMeso.findUniqueOrThrow({ where: { userId_code: { userId, code: "RT1" } }, include: { days: { orderBy: { date: "asc" }, take: 1 } } });
    const day = meso.days[0];
    const before = day.content as PlanBlock[];
    const rows = before.flatMap((b) => (b.kind === "table" ? b.rows : []));
    expect(rows.every((r) => r.basis && r.basis.refs.length > 0)).toBe(true);
    expect(JSON.stringify(meso.intro)).toContain("Referencias");

    const { updateManualDay } = await import("@/lib/planning/manual-plan");
    const edit = rows.map((r, i) => ({ exercise: r.exercise, sets: i === 0 ? "5 × 5" : r.sets, load: r.load, rir: r.rir, rest: r.rest, how: r.how }));
    await updateManualDay(userId, day.id, { title: day.title, durationMin: day.durationMin, type: "STRENGTH", notes: "ignorada", rows: [...edit, { exercise: "Ejercicio nuevo", sets: "2 × 10", load: "", rir: "", rest: "", how: "" }] });
    const after = (await prisma.planDay.findUniqueOrThrow({ where: { id: day.id } })).content as PlanBlock[];
    expect(after.map((b) => b.kind)).toEqual(before.map((b) => b.kind)); // calentamiento, «Dónde» y «Por qué» se quedan
    const out = after.flatMap((b) => (b.kind === "table" ? b.rows : []));
    expect(out[0].sets).toBe("5 × 5");
    expect(out[0].basis!.refs).toEqual(rows[0].basis!.refs); // las citas se conservan
    expect(out[0].basis!.why).toContain("se empieza con 5 series por ejercicio"); // y el texto sigue a las series editadas
    expect(out[1].basis).toEqual(rows[1].basis); // una fila sin tocar queda igual
    expect(out.at(-1)).toMatchObject({ exercise: "Ejercicio nuevo" });
    expect(out.at(-1)!.basis).toBeUndefined();
    expect(JSON.stringify(after)).not.toContain("ignorada");

    const other = await prisma.user.create({ data: { email: `rt-otra-${Date.now()}@test.dev` } });
    const input = { title: "x", durationMin: 30, type: "STRENGTH" as const, notes: "", rows: [] };
    await expect(updateManualDay(other.id, day.id, input)).rejects.toThrow(/no encontrado/i);
    await prisma.user.delete({ where: { id: other.id } });
    await prisma.planMeso.update({ where: { id: meso.id }, data: { status: "ACTIVE" } });
    await expect(updateManualDay(userId, day.id, input)).rejects.toThrow(/no encontrado/i);
    await prisma.planMeso.update({ where: { id: meso.id }, data: { status: "DRAFT" } });
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
