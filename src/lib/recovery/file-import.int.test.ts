// Importación de Apple Salud y Fitness desde export.xml: mismas reglas que el Atajo (no pisa lo anotado) y entrenos a la bandeja.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

let current = { id: "", role: "ATHLETE" as const };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const D = "2026-10-08";
const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe.skipIf(!HAS_DB)("Importar export.xml (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let a: string;
  let b: string;
  const t = testStamp();
  const req = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const days = async (body: unknown) => (await import("@/app/api/recovery/import/days/route")).POST(req("/api/recovery/import/days", body), undefined as never);
  const workouts = async (body: unknown) => (await import("@/app/api/training/apple-fitness/import/route")).POST(req("/api/training/apple-fitness/import", body), undefined as never);
  const run = (over: Record<string, unknown> = {}) => ({ type: "Correr", start: `${D} 08:30:00 +0200`, end: `${D} 09:15:30 +0200`, durationMin: 45.5, distanceM: 7200, kcal: 480, hrAvg: 148, hrMax: 171, ...over });

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    a = (await prisma.user.create({ data: { email: `fi-a-${t}@test.dev`, name: "A" } })).id;
    b = (await prisma.user.create({ data: { email: `fi-b-${t}@test.dev`, name: "B" } })).id;
    current = { id: a, role: "ATHLETE" };
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it("días: guarda lo vacío, conserva lo igual y NO pisa lo anotado a mano (abre un aviso)", async () => {
    await prisma.recoveryMetrics.create({ data: { userId: a, date: day(D), restingHr: 60 } });
    const r = await (await days({ days: [{ date: D, sleepMin: 450, restingHr: 52, hrvSdnnMs: 45.5, weightKg: 62.4 }] })).json();
    expect(r).toMatchObject({ imported: 1, saved: 3, conflicts: 1 });
    const row = await prisma.recoveryMetrics.findUniqueOrThrow({ where: { userId_date: { userId: a, date: day(D) } } });
    expect(row).toMatchObject({ restingHr: 60, sleepHours: 7.5, hrvSdnnMs: 45.5, bodyWeightKg: 62.4 });
    expect(row.hrvRmssdMs).toBeNull(); // la SDNN de Apple nunca va a la rMSSD
    expect(await prisma.healthSyncConflict.count({ where: { userId: a, metric: "RESTING_HR", status: "PENDING" } })).toBe(1);
    // Reimportar el mismo fichero no cambia nada ni duplica avisos
    const again = await (await days({ days: [{ date: D, sleepMin: 450, restingHr: 52, hrvSdnnMs: 45.5, weightKg: 62.4 }] })).json();
    expect(again).toMatchObject({ saved: 0, conflicts: 1 });
    expect(await prisma.healthSyncConflict.count({ where: { userId: a } })).toBe(1);
  });

  it("días: valida el cuerpo (vacío, sin métricas, demasiados)", async () => {
    expect((await days({ days: [] })).status).toBe(400);
    expect((await days({ days: [{ date: D }] })).status).toBe(400);
    expect((await days({ days: Array.from({ length: 401 }, () => ({ date: D, restingHr: 50 })) })).status).toBe(400);
    expect((await days({})).status).toBe(400);
  });

  it("entrenos: van a la bandeja (no al diario), solo de la usuaria, y reimportar no duplica", async () => {
    const r = await (await workouts({ workouts: [run(), run({ type: "Fuerza", start: `${D} 18:00:00 +0200`, end: `${D} 18:50:00 +0200`, durationMin: 50, distanceM: undefined })] })).json();
    expect(r).toEqual({ received: 2, added: 2, duplicates: 0 });
    const again = await (await workouts({ workouts: [run()] })).json();
    expect(again).toEqual({ received: 1, added: 0, duplicates: 1 });
    const rows = await prisma.externalWorkout.findMany({ where: { userId: a }, orderBy: { startedAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "APPLE_FITNESS", status: "PENDING", modality: "RUN", distanceM: 7200, kcal: 480, hrAvg: 148, hrMax: 171 });
    expect(rows[1]).toMatchObject({ modality: "OTHER", activityType: "Fuerza" });
    expect(await prisma.trainingSession.count({ where: { userId: a } })).toBe(0);
    expect(await prisma.externalWorkout.count({ where: { userId: b } })).toBe(0);
  });

  it("entrenos: rechaza lo inválido con 400 en vez de guardar basura", async () => {
    expect((await workouts({ workouts: [] })).status).toBe(400);
    expect((await workouts({ workouts: [run({ hrAvg: 0 })] })).status).toBe(400);
    expect((await workouts({ workouts: [run({ start: "nada" })] })).status).toBe(400);
    expect((await workouts({ workouts: [run({ end: `${D} 08:00:00 +0200` })] })).status).toBe(400);
  });
});
