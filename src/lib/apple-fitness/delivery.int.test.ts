// v3.1 C · Diagnóstico de conexión: último envío y prueba por vía (solo recuentos/campos), «Probar envío», dryRun, unidades y Madrid, aislamiento.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

let current: { id: string; role: "ATHLETE" | "COACH" } = { id: "", role: "ATHLETE" };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("Apple · diagnóstico (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let a: string;
  let b: string;
  let ta: string;
  let tb: string;
  let ip = 0;
  const t = testStamp();
  const req = (path: string, body: unknown, token?: string) =>
    new NextRequest(`http://localhost${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${(ip = (ip % 200) + 1)}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
  const fit = async (body: unknown, token = ta, q = "") => (await import("@/app/api/training/apple-fitness/route")).POST(req(`/api/training/apple-fitness${q}`, body, token), undefined as never);
  const hlt = async (body: unknown, token = ta, q = "") => (await import("@/app/api/recovery/apple-health/route")).POST(req(`/api/recovery/apple-health${q}`, body, token), undefined as never);
  const probar = async (token: string) => (await import("@/app/api/settings/apple-fitness/test/route")).POST(req("/api/settings/apple-fitness/test", { token }), undefined as never);
  const diag = async (user: string) => (await import("./delivery-service")).deliveryStatus(user);

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    a = (await prisma.user.create({ data: { email: `ad-a-${t}@test.dev`, name: "A" } })).id;
    b = (await prisma.user.create({ data: { email: `ad-b-${t}@test.dev`, name: "B" } })).id;
    const svc = await import("./token-service");
    ta = await svc.createAppleToken(a);
    tb = await svc.createAppleToken(b);
    current = { id: a, role: "ATHLETE" };
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b].filter(Boolean) } } });
  });

  it("un envío real de Fitness anota recuentos; con unidades y 23:50 de Madrid cae en su día", async () => {
    const r = await fit({ type: "Fuerza tradicional", start: "2026-10-07T23:50:00", duration: "1 h 5 min", distance: "7,2 km", energyKj: "2008 kJ", hrAvg: "148 lpm" });
    expect(r.status).toBe(200);
    const w = await prisma.externalWorkout.findFirstOrThrow({ where: { userId: a } });
    expect(w).toMatchObject({ distanceM: 7200, kcal: 480, hrAvg: 148, durationSec: 3900, activityType: "Fuerza tradicional" });
    expect(w.date.toISOString().slice(0, 10)).toBe("2026-10-07");
    const d = (await diag(a)).FITNESS;
    expect(d).toMatchObject({ lastStatus: 200, lastSummary: { counts: { received: 1, added: 1, duplicates: 0 } } });
    expect(d.lastAt).not.toBeNull();
  });

  it("un 400 anota nombres de campo, nunca valores", async () => {
    const r = await fit({ type: "Correr", start: "2026-10-07T08:00:00", durationMin: 30, distanceKm: "SECRETO-5-kg" });
    expect(r.status).toBe(400);
    const d = (await diag(a)).FITNESS;
    expect(d.lastStatus).toBe(400);
    expect(JSON.stringify(d.lastSummary)).not.toContain("SECRETO");
    expect(JSON.stringify(d.lastSummary)).toContain("distanceKm");
  });

  it("Salud: sueño que cruza medianoche → día del despertar; anota recuentos", async () => {
    const r = await hlt({ sleepStart: "2026-10-07T23:40:00", sleepEnd: "2026-10-08T07:10:00", weightKg: "62,347 kg" });
    expect(r.status).toBe(200);
    const row = await prisma.recoveryMetrics.findFirstOrThrow({ where: { userId: a } });
    expect(row.date.toISOString().slice(0, 10)).toBe("2026-10-08");
    expect(row).toMatchObject({ sleepHours: 7.5, bodyWeightKg: 62.35 });
    expect((await diag(a)).HEALTH).toMatchObject({ lastStatus: 200 });
  });

  it("dryRun no guarda nada y anota solo la prueba", async () => {
    const before = [await prisma.externalWorkout.count({ where: { userId: a } }), await prisma.recoveryMetrics.count({ where: { userId: a } })];
    const lastBefore = (await diag(a)).FITNESS.lastAt;
    const r1 = await fit({ type: "HIIT", start: "2026-10-09T08:00:00", duration: "30 min", kcal: 300 }, ta, "?dryRun=1");
    const j1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(j1).toMatchObject({ dryRun: true, workouts: [{ date: "2026-10-09", sessionType: "MIXED", durationSec: 1800 }] });
    const r2 = await hlt({ date: "2026-10-09", restingHr: "51 lpm" }, ta, "?dryRun=1");
    expect(r2.status).toBe(200);
    expect([await prisma.externalWorkout.count({ where: { userId: a } }), await prisma.recoveryMetrics.count({ where: { userId: a } })]).toEqual(before);
    const d = await diag(a);
    expect(d.FITNESS.lastAt).toEqual(lastBefore);
    expect(d.FITNESS.testStatus).toBe(200);
    expect(d.HEALTH.testStatus).toBe(200);
  });

  it("«Probar envío» con el token propio funciona y no escribe datos", async () => {
    const before = [await prisma.externalWorkout.count({ where: { userId: a } }), await prisma.recoveryMetrics.count({ where: { userId: a } })];
    const r = await probar(ta);
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, fitness: { ok: true }, health: { ok: true } });
    expect([await prisma.externalWorkout.count({ where: { userId: a } }), await prisma.recoveryMetrics.count({ where: { userId: a } })]).toEqual(before);
    expect((await diag(a)).FITNESS.testSummary).toMatchObject({ counts: { checks: 4 } });
  });

  it("«Probar envío» con el token de otra usuaria, inventado o vacío → 400 y no anota nada en ninguna cuenta", async () => {
    const snap = async () => JSON.stringify([await diag(a), await diag(b)]);
    const before = await snap();
    expect((await probar(tb)).status).toBe(400);
    expect((await probar("x".repeat(43))).status).toBe(400);
    expect((await probar("")).status).toBe(400);
    expect(await snap()).toBe(before);
    // Mismo mensaje para «de otra» y «no existe»: no revela nada
    const m1 = (await (await probar(tb)).json()).error ?? (await (await probar(tb)).text());
    const m2 = (await (await probar("y".repeat(43))).json()).error ?? "";
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
  });

  it("el diagnóstico de una usuaria no aparece en la de otra y sobrevive a revocar el token", async () => {
    expect((await diag(b)).FITNESS.lastAt).toBeNull();
    expect((await diag(b)).HEALTH.testAt).toBeNull();
    await (await import("./token-service")).revokeAppleToken(a);
    expect((await diag(a)).FITNESS.lastStatus).toBe(400);
  });

  it("el export RGPD incluye el diagnóstico de la dueña", async () => {
    const { exportAccount } = await import("@/lib/account/service");
    const data = (await exportAccount(a)) as { appleHealth: { deliveries: { channel: string }[] } };
    expect(data.appleHealth.deliveries.map((d) => d.channel).sort()).toEqual(["FITNESS", "HEALTH"]);
  });

  it("«Crear aparte» de fuerza crea una sesión STRENGTH; HIIT, MIXED; el resto, TRACK", async () => {
    const { importWorkout } = await import("./inbox-service");
    const mk = async (type: string, start: string) => {
      const { ingestWorkouts } = await import("./inbox-service");
      const { workoutSchema } = await import("./payload");
      await ingestWorkouts(b, [workoutSchema.parse({ type, start, durationMin: 40, kcal: 300 })]);
      const w = await prisma.externalWorkout.findFirstOrThrow({ where: { userId: b, activityType: type } });
      const { sessionId } = await importWorkout(b, w.id);
      return prisma.trainingSession.findUniqueOrThrow({ where: { id: sessionId }, select: { type: true, kcal: true, source: true } });
    };
    expect(await mk("Fuerza tradicional", "2026-10-10T18:00:00")).toMatchObject({ type: "STRENGTH", kcal: 300, source: "APPLE_FITNESS" });
    expect(await mk("HIIT", "2026-10-11T18:00:00")).toMatchObject({ type: "MIXED" });
    expect(await mk("Yoga", "2026-10-12T18:00:00")).toMatchObject({ type: "TRACK" });
  });
});
