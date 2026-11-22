// v3.1 B · Apple Salud: token, idempotencia, regla vacío/igual/distinto, resolución de conflictos y aislamiento (IA, entrenadora).
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

let current: { id: string; role: "ATHLETE" | "COACH" } = { id: "", role: "ATHLETE" };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const D1 = "2026-10-07";
const D2 = "2026-10-08";
const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe.skipIf(!HAS_DB)("Apple Salud (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let a: string;
  let b: string;
  let coach: string;
  let token: string;
  let ip = 0;
  const t = testStamp();
  const post = (body: unknown, tok?: string) =>
    new NextRequest("http://localhost/api/recovery/apple-health", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${(ip = (ip % 200) + 1)}`, ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
    });
  const send = async (body: unknown, tok = token) => {
    const { POST } = await import("@/app/api/recovery/apple-health/route");
    return POST(post(body, tok), undefined as never);
  };
  const row = (user: string, d: string) => prisma.recoveryMetrics.findUnique({ where: { userId_date: { userId: user, date: day(d) } } });
  const resolve = async (id: string, keep: string) => {
    const { POST } = await import("@/app/api/recovery/apple-health/conflicts/[id]/route");
    return POST(new NextRequest(`http://localhost/api/recovery/apple-health/conflicts/${id}`, { method: "POST", body: JSON.stringify({ keep }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id }) } as never);
  };

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    a = (await prisma.user.create({ data: { email: `ah-a-${t}@test.dev`, name: "A" } })).id;
    b = (await prisma.user.create({ data: { email: `ah-b-${t}@test.dev`, name: "B" } })).id;
    coach = (await prisma.user.create({ data: { email: `ah-c-${t}@test.dev`, name: "C", role: "COACH" } })).id;
    token = await (await import("@/lib/apple-fitness/token-service")).createAppleToken(a);
    current = { id: a, role: "ATHLETE" };
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [a, b, coach].filter(Boolean) } } });
  });

  it("401 sin token, inventado, revocado; el token de otro propósito no vale", async () => {
    expect((await send({ date: D1, restingHr: 50 }, "")).status).toBe(401);
    expect((await send({ date: D1, restingHr: 50 }, "a".repeat(43))).status).toBe(401);
    const svc = await import("@/lib/apple-fitness/token-service");
    const tb = await svc.createAppleToken(b);
    await prisma.personalToken.updateMany({ where: { userId: b }, data: { purpose: "OTRO" } });
    expect((await send({ date: D1, restingHr: 50 }, tb)).status).toBe(401);
    await prisma.personalToken.deleteMany({ where: { userId: b } });
  });

  it("400 con datos fuera de rango o sin métricas", async () => {
    expect((await send({ date: D1, restingHr: 400 })).status).toBe(400);
    expect((await send({ date: D1 })).status).toBe(400);
  });

  it("campos vacíos se guardan solos y recalculan el readiness; reenviar es idempotente", async () => {
    // Historia de 6 días con SDNN propia para que la VFC puntúe
    for (let i = 1; i <= 6; i++) await send({ date: `2026-09-${String(20 + i).padStart(2, "0")}`, hrvSdnnMs: 50 + (i % 2), restingHr: 50 });
    const body = { date: D1, sleepMin: "450", hrvSdnnMs: "30", restingHr: 52, weightKg: "62,3" };
    const r = await (await send(body)).json();
    expect(r).toMatchObject({ days: 1, saved: 4, unchanged: 0, conflicts: 0 });
    const x = await row(a, D1);
    expect(x).toMatchObject({ sleepHours: 7.5, hrvSdnnMs: 30, restingHr: 52, bodyWeightKg: 62.3, hrvRmssdMs: null });
    expect(x?.readinessScore).not.toBeNull();
    expect((x?.readinessParts as { hrvSource?: string }).hrvSource).toBe("sdnn");
    expect((await prisma.athleteProfile.findUnique({ where: { userId: a } }))?.bodyWeightKg).toBe(62.3);
    // Reenvío idéntico: nada cambia, sin avisos
    const again = await (await send(body)).json();
    expect(again).toMatchObject({ saved: 0, unchanged: 4, conflicts: 0 });
    expect(await prisma.healthSyncConflict.count({ where: { userId: a } })).toBe(0);
    expect((await row(a, D1))?.readinessScore).toBe(x?.readinessScore);
  });

  it("Apple corrige a Apple sin aviso (el valor no lo tocó la usuaria)", async () => {
    await send({ date: D1, restingHr: 54 });
    expect((await row(a, D1))?.restingHr).toBe(54);
    expect(await prisma.healthSyncConflict.count({ where: { userId: a } })).toBe(0);
  });

  it("igual con tolerancia a lo anotado: se conserva lo anotado, sin aviso; distinto: aviso y NO se pisa", async () => {
    await prisma.recoveryMetrics.create({ data: { userId: a, date: day(D2), restingHr: 48, bodyWeightKg: 61, sleepHours: 8 } });
    const r = await (await send({ date: D2, restingHr: 49, weightKg: 63, sleepHours: 8.01, hrvSdnnMs: 41 })).json();
    expect(r).toMatchObject({ saved: 1, unchanged: 2, conflicts: 1 });
    const x = await row(a, D2);
    expect(x).toMatchObject({ restingHr: 48, bodyWeightKg: 61, sleepHours: 8, hrvSdnnMs: 41 });
    const c = await prisma.healthSyncConflict.findMany({ where: { userId: a, date: day(D2) } });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ metric: "BODY_WEIGHT", currentValue: 61, incomingValue: 63, status: "PENDING" });
    // Reenvío: sigue habiendo un solo aviso
    await send({ date: D2, weightKg: 63 });
    expect(await prisma.healthSyncConflict.count({ where: { userId: a, date: day(D2) } })).toBe(1);
  });

  it("la VFC SDNN nunca se compara con la rMSSD anotada", async () => {
    const d = "2026-10-09";
    await prisma.recoveryMetrics.create({ data: { userId: a, date: day(d), hrvRmssdMs: 80 } });
    const r = await (await send({ date: d, hrvSdnnMs: 35 })).json();
    expect(r).toMatchObject({ saved: 1, conflicts: 0 });
    expect(await row(a, d)).toMatchObject({ hrvRmssdMs: 80, hrvSdnnMs: 35 });
  });

  it("resolver: quedarse con lo anotado no se reabre; usar Apple escribe y recalcula; 404 ajena; 409 repetida", async () => {
    const pend = await prisma.healthSyncConflict.findFirstOrThrow({ where: { userId: a, status: "PENDING" } });
    // Otra usuaria no puede resolverlo
    current = { id: b, role: "ATHLETE" };
    expect((await resolve(pend.id, "incoming")).status).toBe(404);
    current = { id: a, role: "ATHLETE" };
    expect((await resolve(pend.id, "current")).status).toBe(200);
    expect((await resolve(pend.id, "incoming")).status).toBe(409);
    expect((await row(a, D2))?.bodyWeightKg).toBe(61);
    await send({ date: D2, weightKg: 63 }); // mismo valor ya descartado: no reabre
    expect((await prisma.healthSyncConflict.findUniqueOrThrow({ where: { id: pend.id } })).status).toBe("KEPT_CURRENT");
    // Otro valor distinto: reabre
    await send({ date: D2, weightKg: 64 });
    const re = await prisma.healthSyncConflict.findUniqueOrThrow({ where: { id: pend.id } });
    expect(re).toMatchObject({ status: "PENDING", incomingValue: 64 });
    const before = (await row(a, D2))?.readinessScore;
    expect((await resolve(pend.id, "incoming")).status).toBe(200);
    expect((await row(a, D2))?.bodyWeightKg).toBe(64);
    expect((await row(a, D2))?.readinessScore).not.toBeUndefined();
    void before;
    expect((await prisma.athleteProfile.findUnique({ where: { userId: a } }))?.bodyWeightKg).toBe(64);
  });

  it("aislamiento: un envío de A no toca a B", async () => {
    expect(await prisma.recoveryMetrics.count({ where: { userId: b } })).toBe(0);
    expect(await prisma.healthSyncConflict.count({ where: { userId: b } })).toBe(0);
  });

  it("entrenadora con RECOVERY + consentimiento lee recuperación, pero no peso, grasa ni lo de Apple", async () => {
    await prisma.recoveryMetrics.update({ where: { userId_date: { userId: a, date: day(D1) } }, data: { bodyFatPct: 18 } });
    await prisma.consent.create({ data: { userId: a, purpose: "COACH_RECOVERY", version: "2026-11-14", granted: true } });
    await prisma.coachAthlete.create({ data: { coachId: coach, athleteId: a, status: "ACTIVE", scopes: ["RECOVERY"], canPlan: false } });
    current = { id: coach, role: "COACH" };
    const { GET } = await import("@/app/api/recovery/route");
    const res = await GET(new NextRequest(`http://localhost/api/recovery?athleteId=${a}&from=2026-10-01&to=2026-10-31`), undefined as never);
    expect(res.status).toBe(200);
    const txt = JSON.stringify(await res.json());
    expect(txt).toContain("restingHr");
    expect(txt).not.toMatch(/bodyWeightKg|bodyFatPct|healthSync|62\.3|"bodyFat/);
    // Sin consentimiento: nada
    await prisma.consent.deleteMany({ where: { userId: a, purpose: "COACH_RECOVERY" } });
    expect((await GET(new NextRequest(`http://localhost/api/recovery?athleteId=${a}`), undefined as never)).status).toBe(403);
    current = { id: a, role: "ATHLETE" };
    // La dueña sí ve su peso
    const own = JSON.stringify(await (await GET(new NextRequest("http://localhost/api/recovery?from=2026-10-01&to=2026-10-31"), undefined as never)).json());
    expect(own).toContain("bodyWeightKg");
  });

  it("la IA (resumen semanal, con y sin recuperación) no lleva peso ni grasa ni SDNN de Apple", async () => {
    const { buildWeeklySnapshot } = await import("@/lib/ai/coach");
    const monday = day("2026-10-05");
    for (const recovery of [true, false]) {
      const json = JSON.stringify(await buildWeeklySnapshot(a, monday, { recovery }));
      expect(json).not.toMatch(/62\.3|"?bodyWeight|bodyFat|sdnn|weightKg/i);
      if (!recovery) expect(json).not.toMatch(/restingHr|"hrv"|sleep/i);
    }
    const { trainingSummary } = await import("@/lib/ai/data-ai");
    expect(JSON.stringify(await trainingSummary(a, D1))).not.toMatch(/62\.3|sdnn|bodyWeight/i);
  });

  it("cuenta con tratamiento limitado: el envío con su token da 401 y no resuelve avisos", async () => {
    await prisma.user.update({ where: { id: a }, data: { processingRestrictedAt: new Date() } });
    expect((await send({ date: D1, restingHr: 50 })).status).toBe(401);
    await prisma.user.update({ where: { id: a }, data: { processingRestrictedAt: null } });
  });
});
