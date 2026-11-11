// Integración con BD real (v2.10 B3 · N7): aplicar un cambio a todas las semanas con vista previa y huella.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { testStamp } from "@/test/stamp";

import { routineAnswersSchema } from "@/lib/routine/questionnaire";

import type { PlanBlock } from "./plan-import/types";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("N7 · todas las semanas (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let mp: typeof import("./manual-plan");
  let userId: string;
  let otherId: string;
  let mesoId: string;
  const answers = routineAnswersSchema.parse({
    sex: "M", age: 41, experience: "retomo", activity: "ligera", tests: { pushups: 12, squats60: 30 },
    shortGoal: "fuerza", shortWeeks: 4, longGoal: "fuerza", horizonMonths: 6, weekdays: [2, 4], minutes: 60,
    locations: ["gimnasio"], dayLocations: [["gimnasio"], ["gimnasio"]], startDate: "2026-10-12",
  });
  const rowsOf = (c: unknown) => (c as PlanBlock[]).flatMap((b) => (b.kind === "table" ? b.rows : []));

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    mp = await import("./manual-plan");
    userId = (await prisma.user.create({ data: { email: `aw-${testStamp()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `aw2-${testStamp()}@test.dev` } })).id;
    await (await import("@/lib/routine/service")).createRoutine(userId, answers, "2026-10-09");
    mesoId = (await prisma.planMeso.findFirstOrThrow({ where: { userId } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("vista previa no escribe; aceptar escribe en el mismo día de las demás semanas; 409 si cambió", async () => {
    const days = await prisma.planDay.findMany({ where: { mesoId }, orderBy: { date: "asc" } });
    const src = days[0];
    const srcRows = rowsOf(src.content);
    const first = srcRows.find((r) => r.basis && /^\d+ ×/.test(r.sets))!;
    const n = Number(/^(\d+)/.exec(first.sets)![1]);
    const edited = srcRows.map((r) => ({ exercise: r.exercise, sets: r.exercise === first.exercise ? first.sets.replace(/^\d+/, String(n + 1)) : r.sets, load: r.load, rir: r.rir, rest: r.rest, how: r.how }));
    const input = { day: { title: src.title, durationMin: src.durationMin, type: "STRENGTH" as const, notes: "", rows: edited }, exercises: [first.exercise], dryRun: true };

    const before = JSON.stringify((await prisma.planDay.findMany({ where: { mesoId }, orderBy: { id: "asc" } })).map((d) => d.content));
    const prev = await mp.previewAllWeeks(userId, src.id, input);
    expect(prev.items.length).toBeGreaterThan(0);
    expect(new Set(prev.items.map((i) => i.dayId)).has(src.id)).toBe(false);
    expect(JSON.stringify((await prisma.planDay.findMany({ where: { mesoId }, orderBy: { id: "asc" } })).map((d) => d.content))).toBe(before);

    await expect(mp.applyAllWeeks(userId, src.id, { ...input, dryRun: false, fingerprint: "mala" })).rejects.toThrow(/cambió/);
    const r = await mp.applyAllWeeks(userId, src.id, { ...input, dryRun: false, fingerprint: prev.fingerprint });
    expect(r.days).toBeGreaterThan(0);

    const target = await prisma.planDay.findUniqueOrThrow({ where: { id: prev.items[0].dayId } });
    const row = rowsOf(target.content).find((x) => x.exercise === first.exercise)!;
    expect(row.basis?.refs).toEqual(first.basis!.refs);
    expect(row.basis?.why).toContain(`se empieza con ${Number(/^(\d+)/.exec(row.sets)![1])} series`);
    // otros ejercicios de esa semana, intactos
    const orig = days.find((d) => d.id === target.id)!;
    expect(rowsOf(target.content).filter((x) => x.exercise !== first.exercise)).toEqual(rowsOf(orig.content).filter((x) => x.exercise !== first.exercise));

    // el plan cambió: la huella antigua ya no vale
    await expect(mp.applyAllWeeks(userId, src.id, { ...input, dryRun: false, fingerprint: prev.fingerprint })).rejects.toThrow(/cambió/);
  });

  it("otro usuario no puede", async () => {
    const d = await prisma.planDay.findFirstOrThrow({ where: { mesoId } });
    await expect(mp.previewAllWeeks(otherId, d.id, { day: { title: "x", durationMin: null, type: "STRENGTH", notes: "", rows: [] }, exercises: ["a"], dryRun: true })).rejects.toThrow(/no encontrado/i);
  });
});
