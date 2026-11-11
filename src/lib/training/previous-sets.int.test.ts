// Integración con BD real (v2.10 B1): última sesión completada por ejercicio.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);


describe.skipIf(!HAS_DB)("lastSetsByExercise (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let fn: typeof import("./previous-sets-service").lastSetsByExercise;
  let userId: string;
  let otherId: string;
  let exId: string;
  const ids: string[] = [];

  async function make(uid: string, date: string, status: "COMPLETED" | "PLANNED", sets: Array<[number, number, boolean, number | null]>) {
    const s = await prisma.trainingSession.create({
      data: {
        userId: uid,
        date: new Date(`${date}T00:00:00Z`),
        type: "STRENGTH",
        status,
        strength: { create: { sets: { create: sets.map(([reps, weightKg, isWarmup, restSec], i) => ({ exerciseId: exId, order: i, setIndex: i, reps, weightKg, isWarmup, restSec })) } } },
      },
    });
    ids.push(s.id);
    return s.id;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    fn = (await import("./previous-sets-service")).lastSetsByExercise;
    userId = (await prisma.user.create({ data: { email: `v210b1-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `v210b1o-${Date.now()}@test.dev` } })).id;
    exId = (await prisma.exercise.create({ data: { name: `Ej v210b1 ${Date.now()}`, userId } })).id;
  });

  afterAll(async () => {
    await prisma.trainingSession.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.user.delete({ where: { id: otherId } });
  });

  it("devuelve las series de la última sesión COMPLETADA; ignora planificadas y de otra usuaria", async () => {
    await make(userId, "2026-10-01", "COMPLETED", [[5, 70, false, 120]]);
    const last = await make(userId, "2026-10-08", "COMPLETED", [[5, 80, false, 90], [3, 85, false, 90]]);
    await make(userId, "2026-10-15", "PLANNED", [[5, 999, false, null]]);
    await make(otherId, "2026-10-20", "COMPLETED", [[5, 500, false, null]]);
    const r = await fn(userId);
    expect(r[exId].date).toBe("2026-10-08");
    expect(r[exId].sets.map((s) => [s.reps, s.weightKg, s.restSec])).toEqual([[5, 80, 90], [3, 85, 90]]);
    // al editar esa misma sesión se usa la anterior
    const r2 = await fn(userId, { excludeSessionId: last });
    expect(r2[exId].date).toBe("2026-10-01");
    expect(r2[exId].sets).toHaveLength(1);
  });
});
