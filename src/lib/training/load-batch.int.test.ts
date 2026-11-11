// v2.7.0 B2 · O4: la carga se recalcula una vez (restaurar, Strava) y el readiness va en lote (VFC y recálculo),
// con un contador de consultas y los mismos valores que el camino día a día.
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

// Cliente real que cuenta cada operación enviada a la BD (también `$executeRaw`, que `$allModels` no ve).
const counter = { n: 0, on: false };
vi.mock("@/lib/prisma", async () => {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@/generated/prisma/client");
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 5 }) });
  const prisma = base.$extends({
    query: {
      async $allOperations({ args, query }) {
        if (counter.on) counter.n++;
        return query(args);
      },
    },
  });
  return { prisma };
});

const HAS_DB = Boolean(process.env.DATABASE_URL);
const counts: Record<string, number> = {};

async function measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
  counter.n = 0;
  counter.on = true;
  try {
    return await fn();
  } finally {
    counter.on = false;
    counts[label] = counter.n;
  }
}

const iso = (d: number) => `2026-10-${String(d).padStart(2, "0")}`;

describe.skipIf(!HAS_DB)("O4 · carga una vez y readiness en lote (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let training: typeof import("./service");
  const t = testStamp();
  let seq = 0;

  async function user(tag: string) {
    const id = (await prisma.user.create({ data: { email: `o4${tag}${seq++}-${t}@test.dev` } })).id;
    await prisma.athleteProfile.create({ data: { userId: id, sex: "FEMALE", ctlTimeConstant: 42, atlTimeConstant: 7 } });
    await prisma.thresholdHistory.create({ data: { userId: id, effectiveFrom: new Date("2026-01-01"), hrMax: 195, hrRest: 50, lthr: 170, thresholdPaceSecPerKm: 270 } });
    return id;
  }

  /** Recuperación de `days` días (1 de octubre en adelante) con VFC/FC/sueño variados. */
  function recoveryRows(days: number): Array<{ date: string; hrvRmssdMs: number | null; restingHr: number | null; sleepHours: number | null }> {
    return Array.from({ length: days }, (_, i) => ({
      date: iso(1 + (i % 31)),
      hrvRmssdMs: 55 + ((i * 7) % 23) + 0.37 * i,
      restingHr: 48 + ((i * 5) % 9),
      sleepHours: 6 + ((i * 3) % 5) * 0.5,
    })).slice(0, Math.min(days, 31));
  }

  async function sessions(userId: string, n: number, opts: { skipLoads?: boolean } = {}) {
    for (let i = 0; i < n; i++) {
      await training.createTrainingSession(userId, null, { date: iso(1 + ((i * 3) % 30)), type: "MIXED", status: "COMPLETED", sessionRpe: 4 + (i % 5), durationSec: 1800 + 300 * (i % 7) } as never, opts);
    }
  }

  async function snapshot(userId: string) {
    const [loads, rec] = await Promise.all([
      prisma.dailyLoad.findMany({ where: { userId }, orderBy: { date: "asc" }, select: { date: true, tss: true, ctl: true, atl: true, tsb: true, acwr: true } }),
      prisma.recoveryMetrics.findMany({ where: { userId }, orderBy: { date: "asc" }, select: { date: true, readinessScore: true, readinessParts: true } }),
    ]);
    return { loads, rec };
  }

  /** Camino de referencia (el de antes): readiness día a día. */
  async function readinessDayByDay(userId: string) {
    for (const r of await prisma.recoveryMetrics.findMany({ where: { userId }, select: { date: true } })) await training.refreshReadiness(userId, r.date);
  }

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    process.env.STRAVA_BASE_URL = "http://strava.invalid";
    process.env.STRAVA_CLIENT_ID = "12345";
    process.env.STRAVA_CLIENT_SECRET = "secreto-de-prueba-123";
    process.env.AUTH_URL = "https://atlenza.test";
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    training = await import("./service");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
    console.log(`O4-COUNTS ${JSON.stringify(counts)}`);
  });

  it("recalcular la carga: readiness en lote igual que día a día; consultas fijas", async () => {
    const id = await user("r");
    await sessions(id, 10);
    const { saveRecoveryRows } = await import("@/lib/recovery/hrv-import-service");
    await saveRecoveryRows(id, recoveryRows(30));
    await measure("recomputeDailyLoads (10 sesiones, 30 días de recuperación)", () => training.recomputeDailyLoads(id, new Date(iso(1))));
    const batch = await snapshot(id);
    expect(batch.rec.filter((r) => r.readinessScore != null).length).toBeGreaterThan(5);
    await readinessDayByDay(id);
    expect(await snapshot(id)).toEqual(batch);

    const small = await user("r");
    await sessions(small, 10);
    await saveRecoveryRows(small, recoveryRows(5));
    await measure("recomputeDailyLoads (10 sesiones, 5 días de recuperación)", () => training.recomputeDailyLoads(small, new Date(iso(1))));
    expect(counts["recomputeDailyLoads (10 sesiones, 30 días de recuperación)"]).toBe(counts["recomputeDailyLoads (10 sesiones, 5 días de recuperación)"]);
    // Antes (medido en el código de v2.6): 128 y 28 → 8 lecturas/escrituras de carga + 4 por día con recuperación.
    expect(counts["recomputeDailyLoads (10 sesiones, 30 días de recuperación)"]).toBeLessThanOrEqual(9);
  });

  it("importar VFC: un alta/actualización y el readiness en lote; mismos valores que fila a fila", async () => {
    const { saveRecoveryRows } = await import("@/lib/recovery/hrv-import-service");
    const id = await user("v");
    await sessions(id, 6);
    // Días que ya existen (con datos del control rápido que no deben tocarse) y otros nuevos; un día repetido.
    await prisma.recoveryMetrics.create({ data: { userId: id, date: new Date(iso(3)), doms: 4, hrvRmssdMs: 99 } });
    const rows = recoveryRows(30);
    rows.push({ date: iso(5), hrvRmssdMs: null, restingHr: 61, sleepHours: null });
    await measure("importar VFC (30 días)", () => saveRecoveryRows(id, rows));
    const batch = await snapshot(id);
    const day3 = await prisma.recoveryMetrics.findFirstOrThrow({ where: { userId: id, date: new Date(iso(3)) } });
    expect(day3).toMatchObject({ doms: 4, hrvRmssdMs: rows[2].hrvRmssdMs });
    expect(await prisma.recoveryMetrics.findFirstOrThrow({ where: { userId: id, date: new Date(iso(5)) } })).toMatchObject({ hrvRmssdMs: rows[4].hrvRmssdMs, restingHr: 61 });
    await readinessDayByDay(id);
    expect(await snapshot(id)).toEqual(batch);

    const small = await user("v");
    await sessions(small, 6);
    await prisma.recoveryMetrics.create({ data: { userId: small, date: new Date(iso(3)), doms: 2 } });
    await measure("importar VFC (5 días)", () => saveRecoveryRows(small, recoveryRows(5)));
    expect(counts["importar VFC (30 días)"]).toBe(counts["importar VFC (5 días)"]);
    // Antes: 155 (31 filas: un upsert + 4 consultas de readiness por fila).
    expect(counts["importar VFC (30 días)"]).toBeLessThanOrEqual(6);
  });

  it("restaurar: la carga se recalcula una vez y queda igual que en la cuenta de origen", async () => {
    const { saveRecoveryRows } = await import("@/lib/recovery/hrv-import-service");
    const { exportAccount } = await import("@/lib/account/service");
    const { restoreExport } = await import("@/lib/account/restore");
    const from = await user("e");
    await sessions(from, 20);
    await saveRecoveryRows(from, recoveryRows(30));
    await training.recomputeDailyLoads(from, new Date(iso(1)));
    const data = JSON.parse(JSON.stringify(await exportAccount(from)));
    const to = (await prisma.user.create({ data: { email: `o4to${seq++}-${t}@test.dev` } })).id;
    const r = await measure("restaurar (20 sesiones, 30 días de recuperación)", () => restoreExport(to, data));
    expect(r.counts).toMatchObject({ sesiones: 20, "días de recuperación": 30 });
    const [a, b] = [await snapshot(from), await snapshot(to)];
    expect(b).toEqual(a);
  });

  it("Strava: una sola pasada de carga; igual que un recálculo limpio y casi igual a la cadena de antes", async () => {
    const strava = await import("@/lib/strava/service");
    const id = await user("s");
    const { saveRecoveryRows } = await import("@/lib/recovery/hrv-import-service");
    await saveRecoveryRows(id, recoveryRows(30));
    const N = 10;
    const activities = Array.from({ length: N }, (_, i) => ({
      id: 9000 + i,
      name: `Rodaje ${i}`,
      sport_type: "Run",
      start_date: new Date(Date.UTC(2026, 9, 2 + 2 * i, 7, 30)).toISOString().replace(".000", ""),
      elapsed_time: 2400 + 120 * i,
      moving_time: 2300 + 120 * i,
      distance: 7000 + 350 * i,
      average_heartrate: 140 + (i % 4) * 3,
      max_heartrate: 165,
    }));
    const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } });
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/oauth/token")) return json({ access_token: "acc", refresh_token: "ref", expires_at: Math.floor(Date.now() / 1000) + 3600, athlete: { id: 70000 + (t % 10000) } });
      if (url.includes("/athlete/activities")) return json(new URL(url).searchParams.get("page") === "1" ? activities : []);
      return json({});
    }) as typeof fetch;
    await strava.connectStrava(id, "code", "activity:read_all", fetcher);
    const res = await measure(`Strava (${N} actividades, 30 días de recuperación)`, () => strava.syncStrava(id, { fetcher, now: new Date(Date.UTC(2026, 8, 30)) }));
    expect(res).toEqual({ imported: N, skipped: 0 });
    const imported = await prisma.trainingSession.findMany({ where: { userId: id }, orderBy: { date: "asc" }, select: { date: true, tss: true } });
    expect(imported.filter((s) => s.tss != null)).toHaveLength(N);
    const single = await snapshot(id);
    expect(single.loads.at(0)?.date.toISOString().slice(0, 10)).toBe(iso(2));

    // Recálculo limpio desde la más antigua (+ readiness día a día): idéntico.
    await training.recomputeDailyLoads(id, imported[0].date);
    await readinessDayByDay(id);
    expect(await snapshot(id)).toEqual(single);

    // Cadena de antes: un recálculo por sesión, en orden (las sesiones posteriores no cambian los días anteriores).
    for (const s of imported.slice(1)) await training.recomputeDailyLoads(id, s.date);
    await readinessDayByDay(id);
    const chain = await snapshot(id);
    expect(chain.loads.map((l) => l.date)).toEqual(single.loads.map((l) => l.date));
    let maxDiff = 0;
    single.loads.forEach((l, i) => {
      for (const k of ["tss", "ctl", "atl", "tsb", "acwr"] as const) maxDiff = Math.max(maxDiff, Math.abs((l[k] ?? 0) - (chain.loads[i][k] ?? 0)));
    });
    counts["Strava: diferencia máxima con la cadena de antes (centésimas)"] = Math.round(maxDiff * 100);
    // Solo el redondeo a 2 decimales de la semilla de cada recálculo de antes.
    expect(maxDiff).toBeLessThanOrEqual(0.011);
  });
});
