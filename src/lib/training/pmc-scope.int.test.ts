// N9 · La API del PMC no deja que una entrenadora sin ámbito RECOVERY vea readiness, VFC, sueño, FC en reposo ni agujetas,
// y la frase del PMC (solo carga) se entrega a quien ve la carga.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current: { id: string; role: "ATHLETE" | "COACH" } = { id: "", role: "ATHLETE" };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const REC = ["readinessScore", "hrvRmssdMs", "sleepHours", "restingHr", "doms"];

type Body = { explanation: string | null; recoveryHidden?: boolean; series: Array<Record<string, unknown>>; current: Record<string, unknown> | null };

describe.skipIf(!HAS_DB)("PMC y ámbito RECOVERY (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let athlete: string;
  let coachLoad: string;
  let coachAll: string;
  const t = Date.now();
  const d = new Date();
  const recent = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));
  const req = (url: string) => new NextRequest(`http://localhost${url}`);

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    athlete = (await prisma.user.create({ data: { email: `ps-a-${t}@test.dev`, name: "Atleta" } })).id;
    coachLoad = (await prisma.user.create({ data: { email: `ps-c1-${t}@test.dev`, name: "Entrenadora", role: "COACH" } })).id;
    coachAll = (await prisma.user.create({ data: { email: `ps-c2-${t}@test.dev`, name: "Entrenadora 2", role: "COACH" } })).id;
    await prisma.coachAthlete.create({ data: { coachId: coachLoad, athleteId: athlete, status: "ACTIVE", scopes: ["SESSIONS", "LOAD"] } });
    await prisma.coachAthlete.create({ data: { coachId: coachAll, athleteId: athlete, status: "ACTIVE", scopes: ["SESSIONS", "LOAD", "RECOVERY"] } });
    await prisma.trainingSession.create({ data: { userId: athlete, date: recent, type: "STRENGTH", status: "COMPLETED", durationSec: 3600, tss: 60, title: "Fuerza propia" } });
    await prisma.recoveryMetrics.create({ data: { userId: athlete, date: recent, hrvRmssdMs: 77.7, sleepHours: 6.5, restingHr: 51, doms: 3, readinessScore: 62 } });
    const { recomputeDailyLoads } = await import("@/lib/training/service");
    await recomputeDailyLoads(athlete, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 7)));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [athlete, coachLoad, coachAll].filter(Boolean) } } });
  });

  const get = async () => {
    const pmc = await import("@/app/api/training/pmc/route");
    return (await (await pmc.GET(req(`/api/training/pmc?athleteId=${athlete}&days=14`), undefined as never)).json()) as Body;
  };

  it("sin RECOVERY: carga y frase sí; recuperación no", async () => {
    current = { id: coachLoad, role: "COACH" };
    const b = await get();
    expect(b.recoveryHidden).toBe(true);
    expect(b.series.every((r) => REC.every((k) => !(k in r)))).toBe(true);
    expect(b.current?.readiness ?? null).toBeNull();
    if (b.explanation) expect(b.explanation).not.toMatch(/sueño|VFC|readiness|agujetas/i);
  });

  it("con RECOVERY: ve la recuperación", async () => {
    current = { id: coachAll, role: "COACH" };
    const b = await get();
    expect(b.recoveryHidden).toBeUndefined();
    expect(b.series.some((r) => r.hrvRmssdMs === 77.7)).toBe(true);
  });

  it("la atleta lo ve todo", async () => {
    current = { id: athlete, role: "ATHLETE" };
    const pmc = await import("@/app/api/training/pmc/route");
    const b = (await (await pmc.GET(req("/api/training/pmc?days=14"), undefined as never)).json()) as Body;
    expect(b.recoveryHidden).toBeUndefined();
    expect(b.series.some((r) => r.sleepHours === 6.5)).toBe(true);
  });
});
