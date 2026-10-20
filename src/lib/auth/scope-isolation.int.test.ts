// Seguridad (bloque 7): una entrenadora con UN solo ámbito solo lee ese ámbito, y nunca lo importado de Strava.
//
// Recorre las rutas que reciben `athleteId` o `?athlete=` y leen datos deportivos de otra persona:
//   LOAD      → thresholds, recompute, reference-curves/[id]/compare (resultados de tests)
//   SESSIONS  → exercises, exercises/[id], exercises/[id]/video
//   PLANNING  → planning/cycles, planning/events
//   RECOVERY  → recovery, recovery/injuries
// Con cada entrenadora: ámbito ajeno → 403; ámbito propio → responde sin rastro de los otros ámbitos ni de Strava.
//
// Rutas que leen a otra persona y NO están aquí, con su motivo:
//   - training/sessions, sessions/[id], records, pmc, ai/coach/weekly, .ics, informe compartido, panel del club,
//     comentarios y fisio compartida: ya cubiertas en `strava/privacy.int.test.ts`, `block-l`, `physio` y `club-panel`.
//   - páginas `training/exercises`, `exercises/[id]` y `tests/comparar`: llaman al mismo `resolveAthleteId` y a los
//     mismos servicios que las rutas de arriba, sin consulta propia.
//   - coach/links: solo vínculos del propio usuario, no datos de la atleta. health/cycle|women: no aceptan `athleteId`
//     (solo la propia persona, y cifrado). recovery/physio/[id]/shares: ver `physio.int.test.ts`.
//   - POST/PATCH/DELETE: pasan por `resolveAthleteId(…, "write")`; aquí se prueba que un ámbito ajeno no escribe.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current: { id: string; role: "ATHLETE" | "COACH" } = { id: "", role: "ATHLETE" };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const SCOPES = ["LOAD", "SESSIONS", "PLANNING", "RECOVERY", "REPORTS"] as const;
type Scope = (typeof SCOPES)[number];

// Marcas sintéticas: cada ámbito tiene la suya, y Strava otra.
const M = {
  STRAVA: "MARCA-STRAVA-RODAJE",
  LOAD: "MARCA-LOAD-UMBRAL",
  SESSIONS: "MARCA-SESSIONS-EJERCICIO",
  PLANNING: "MARCA-PLANNING-CICLO",
  PLANNING_EVENT: "MARCA-PLANNING-EVENTO",
  RECOVERY: "MARCA-RECOVERY-LESION",
  RECOVERY_DAY: "MARCA-RECOVERY-DIA",
  TEST: "MARCA-LOAD-TEST",
} as const;
const OWN: Record<Scope, string[]> = {
  LOAD: [M.LOAD, M.TEST],
  SESSIONS: [M.SESSIONS],
  PLANNING: [M.PLANNING, M.PLANNING_EVENT],
  RECOVERY: [M.RECOVERY, M.RECOVERY_DAY],
  REPORTS: [],
};

describe.skipIf(!HAS_DB)("una entrenadora con un solo ámbito (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let athlete: string;
  let exerciseId: string;
  let curveId: string;
  const coaches = {} as Record<Scope, string>;
  const t = Date.now();
  const day = new Date(Date.UTC(2026, 9, 7));
  const req = (url: string, method = "GET", body?: unknown) =>
    new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { "content-type": "application/json" } });
  const id = (v: string) => ({ params: Promise.resolve({ id: v }) }) as never;

  type Call = { name: string; scope: Scope; run: () => Promise<Response> };
  const calls = (): Call[] => {
    const a = `athleteId=${athlete}`;
    const q = `athlete=${athlete}`;
    return [
      { name: "GET thresholds", scope: "LOAD", run: async () => (await import("@/app/api/training/thresholds/route")).GET(req(`/api/training/thresholds?${a}`), undefined as never) },
      { name: "POST recompute", scope: "LOAD", run: async () => (await import("@/app/api/training/recompute/route")).POST(req("/api/training/recompute", "POST", { athleteId: athlete }), undefined as never) },
      { name: "GET reference-curves/compare", scope: "LOAD", run: async () => (await import("@/app/api/training/reference-curves/[id]/compare/route")).GET(req(`/api/training/reference-curves/${curveId}/compare?${q}`), id(curveId)) },
      { name: "GET exercises", scope: "SESSIONS", run: async () => (await import("@/app/api/training/exercises/route")).GET(req(`/api/training/exercises?${q}`), undefined as never) },
      { name: "GET exercises/[id]", scope: "SESSIONS", run: async () => (await import("@/app/api/training/exercises/[id]/route")).GET(req(`/api/training/exercises/${exerciseId}?${q}`), id(exerciseId)) },
      { name: "GET exercises/[id]/video", scope: "SESSIONS", run: async () => (await import("@/app/api/training/exercises/[id]/video/route")).GET(req(`/api/training/exercises/${exerciseId}/video?${q}`), id(exerciseId)) },
      { name: "GET planning/cycles", scope: "PLANNING", run: async () => (await import("@/app/api/planning/cycles/route")).GET(req(`/api/planning/cycles?${a}`), undefined as never) },
      { name: "GET planning/events", scope: "PLANNING", run: async () => (await import("@/app/api/planning/events/route")).GET(req(`/api/planning/events?${a}&from=2026-01-01&to=2026-12-31`), undefined as never) },
      { name: "GET recovery", scope: "RECOVERY", run: async () => (await import("@/app/api/recovery/route")).GET(req(`/api/recovery?${a}&from=2026-10-01&to=2026-10-31`), undefined as never) },
      { name: "GET recovery/injuries", scope: "RECOVERY", run: async () => (await import("@/app/api/recovery/injuries/route")).GET(req(`/api/recovery/injuries?${a}`), undefined as never) },
    ];
  };

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    athlete = (await prisma.user.create({ data: { email: `si-a-${t}@test.dev`, name: "Atleta" } })).id;
    await prisma.athleteProfile.create({ data: { userId: athlete, birthDate: new Date(Date.UTC(2010, 0, 1)) } });
    for (const s of SCOPES) {
      coaches[s] = (await prisma.user.create({ data: { email: `si-c-${s.toLowerCase()}-${t}@test.dev`, name: `Entrenadora ${s}`, role: "COACH" } })).id;
      await prisma.coachAthlete.create({ data: { coachId: coaches[s], athleteId: athlete, status: "ACTIVE", scopes: [s], canPlan: true } });
    }
    // Una sesión de Strava (con TSS pendiente de recalcular) y una propia
    await prisma.trainingSession.create({ data: { userId: athlete, date: day, type: "TRACK", status: "COMPLETED", durationSec: 3000, sessionRpe: 6, title: M.STRAVA, source: "STRAVA", externalId: `strava:si-${t}` } });
    await prisma.trainingSession.create({ data: { userId: athlete, date: day, type: "STRENGTH", status: "COMPLETED", durationSec: 3600, sessionRpe: 5, title: "Fuerza propia" } });
    await prisma.thresholdHistory.create({ data: { userId: athlete, effectiveFrom: day, lthr: 171, notes: M.LOAD } });
    await prisma.testResult.create({ data: { userId: athlete, testKey: "cmj", name: M.TEST, unit: "cm", higherIsBetter: true, value: 44.4, date: day } });
    exerciseId = (await prisma.exercise.create({ data: { userId: athlete, name: `${M.SESSIONS}-${t}` } })).id;
    await prisma.trainingCycle.create({ data: { userId: athlete, level: "MESO", name: M.PLANNING, startDate: day, endDate: new Date(Date.UTC(2026, 10, 7)) } });
    await prisma.calendarEvent.create({ data: { userId: athlete, type: "COMPETITION", title: M.PLANNING_EVENT, startAt: day, priority: "A" } });
    await prisma.recoveryMetrics.create({ data: { userId: athlete, date: day, hrvRmssdMs: 77.7, sleepHours: 6.5, notes: M.RECOVERY_DAY } });
    await prisma.injury.create({ data: { userId: athlete, area: "SHOULDER", pain: 4, startedOn: day, notes: M.RECOVERY } });
    curveId = (
      await prisma.referenceCurve.create({
        data: { createdById: athlete, global: true, testKey: "cmj", unit: "cm", higherIsBetter: true, title: `Curva ${t}`, study: "Estudio", authors: "Autora", year: 2020, citation: "Autora (2020).", points: [{ x: 14, p50: 40 }, { x: 16, p50: 48 }] },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.referenceCurve.deleteMany({ where: { id: curveId } });
    await prisma.user.deleteMany({ where: { id: { in: [athlete, ...Object.values(coaches)].filter(Boolean) } } });
  });

  for (const scope of SCOPES) {
    it(`entrenadora solo con ${scope}: lo ajeno da 403; lo suyo no trae otros ámbitos ni Strava`, async () => {
      current = { id: coaches[scope], role: "COACH" };
      const others = (Object.keys(OWN) as Scope[]).filter((s) => s !== scope).flatMap((s) => OWN[s]);
      for (const c of calls()) {
        const res = await c.run();
        if (c.scope !== scope) {
          expect(res.status, `${c.name} con ${scope}`).toBe(403);
          continue;
        }
        // GET del vídeo: el ejercicio no tiene clip → 404 (pasó el control de acceso); el resto 2xx
        expect(res.status, `${c.name} con ${scope}`).toBe(c.name.endsWith("/video") ? 404 : 200);
        const text = await res.text();
        expect(text, c.name).not.toContain(M.STRAVA);
        for (const other of others) expect(text, `${c.name} no debe traer ${other}`).not.toContain(other);
      }
    });
  }

  it("lo propio de cada ámbito sí llega a la entrenadora que lo tiene (la prueba no es vacía)", async () => {
    const own = async (scope: Scope, name: string) => {
      current = { id: coaches[scope], role: "COACH" };
      return (await calls().find((c) => c.name === name)!.run()).text();
    };
    expect(await own("LOAD", "GET thresholds")).toContain(M.LOAD);
    expect(await own("LOAD", "GET reference-curves/compare")).toContain("44.4");
    expect(await own("SESSIONS", "GET exercises")).toContain(M.SESSIONS);
    expect(await own("SESSIONS", "GET exercises/[id]")).toContain(M.SESSIONS);
    expect(await own("PLANNING", "GET planning/cycles")).toContain(M.PLANNING);
    expect(await own("PLANNING", "GET planning/events")).toContain(M.PLANNING_EVENT);
    expect(await own("RECOVERY", "GET recovery")).toContain(M.RECOVERY_DAY);
    expect(await own("RECOVERY", "GET recovery/injuries")).toContain(M.RECOVERY);
  });

  it("el recálculo de una entrenadora no revela cuántas sesiones de Strava hay; la atleta ve el total", async () => {
    current = { id: coaches.LOAD, role: "COACH" };
    const viaCoach = (await (await calls().find((c) => c.name === "POST recompute")!.run()).json()) as { sessions: number };
    expect(viaCoach.sessions).toBe(1);
    current = { id: athlete, role: "ATHLETE" };
    const { POST } = await import("@/app/api/training/recompute/route");
    const own = (await (await POST(req("/api/training/recompute", "POST", {}), undefined as never)).json()) as { sessions: number };
    expect(own.sessions).toBe(2);
  });

  it("escribir en un ámbito ajeno da 403 aunque la entrenadora pueda planificar", async () => {
    const writes: Array<[Scope, () => Promise<Response>]> = [
      ["LOAD", async () => (await import("@/app/api/training/thresholds/route")).POST(req(`/api/training/thresholds?athleteId=${athlete}`, "POST", { effectiveFrom: "2026-10-08", lthr: 170 }), undefined as never)],
      ["PLANNING", async () => (await import("@/app/api/planning/events/route")).POST(req(`/api/planning/events?athleteId=${athlete}`, "POST", { type: "COMPETITION", title: "x", startAt: "2026-11-01" }), undefined as never)],
      ["PLANNING", async () => (await import("@/app/api/planning/cycles/route")).POST(req(`/api/planning/cycles?athleteId=${athlete}`, "POST", { level: "MESO", name: "x", startDate: "2026-11-01", endDate: "2026-11-30" }), undefined as never)],
    ];
    for (const coach of SCOPES) {
      current = { id: coaches[coach], role: "COACH" };
      for (const [needs, run] of writes) if (needs !== coach) expect((await run()).status, `${needs} con ${coach}`).toBe(403);
    }
    expect(await prisma.thresholdHistory.count({ where: { userId: athlete } })).toBe(1);
    expect(await prisma.calendarEvent.count({ where: { userId: athlete } })).toBe(1);
  });
});
