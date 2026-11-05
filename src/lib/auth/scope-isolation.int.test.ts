// Seguridad (bloque 7): una entrenadora con UN solo ámbito solo lee ese ámbito, y nunca lo importado de Strava.
//
// Recorre las rutas que reciben `athleteId` o `?athlete=` y leen datos deportivos de otra persona:
//   LOAD      → thresholds, recompute, reference-curves/[id]/compare (resultados de tests)
//   SESSIONS  → exercises, exercises/[id], exercises/[id]/video
//   PLANNING  → planning/cycles, planning/events
//   RECOVERY  → recovery, recovery/injuries
// Con cada entrenadora: ámbito ajeno → 403; ámbito propio → responde sin rastro de los otros ámbitos ni de Strava.
//
// Texto libre de la IA (v2.7.0 B4, S1): ai/coach/weekly se prueba al final de este fichero (prompt, respuesta y informe guardado).
//
// Rutas que leen a otra persona y NO están aquí, con su motivo:
//   - training/sessions, sessions/[id], records, pmc, .ics, informe compartido, panel del club,
//     comentarios y fisio compartida: ya cubiertas en `strava/privacy.int.test.ts`, `block-l`, `physio` y `club-panel`.
//   - páginas `training/exercises`, `exercises/[id]` y `tests/comparar`: llaman al mismo `resolveAthleteId` y a los
//     mismos servicios que las rutas de arriba, sin consulta propia.
//   - coach/links: solo vínculos del propio usuario, no datos de la atleta. health/cycle|women: no aceptan `athleteId`
//     (solo la propia persona, y cifrado). recovery/physio/[id]/shares: ver `physio.int.test.ts`.
//   - POST/PATCH/DELETE: pasan por `resolveAthleteId(…, "write")`; aquí se prueba que un ámbito ajeno no escribe.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current: { id: string; role: "ATHLETE" | "COACH" } = { id: "", role: "ATHLETE" };
// IA simulada (v2.7.0 B4): captura lo que llegaría al modelo y devuelve un texto que cita la recuperación aunque no se le dio
const aiCalls: Array<{ system: string; prompt: string }> = [];
const LEAKY_REPORT = {
  summary: "Semana dura. Tu VFC de 77,7 ms está baja y duermes 6.5 h. Carga estable.",
  riskLevel: "MODERATE",
  keyFindings: ["Rampa de CTL alta", "FC en reposo de 43 elevada"],
  recommendations: [
    { area: "SLEEP", action: "Duerme 8 h", rationale: "Sueño de 6.5 h", priority: "HIGH" },
    { area: "LOAD", action: "Baja el volumen un 20 %. Vigila la recuperación.", rationale: "Rampa alta", priority: "HIGH" },
  ],
  nextWeek: { targetTssMin: 200, targetTssMax: 300, maxHardSessions: 2, notes: "Tapering. Descanso extra por la VFC." },
  dataGaps: ["Falta registrar el sueño"],
};
vi.mock("@/lib/ai/llm", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/llm")>()),
  generateJson: async (_schema: unknown, p: { system: string; prompt: string }) => {
    aiCalls.push({ system: p.system, prompt: p.prompt });
    return { data: structuredClone(LEAKY_REPORT), model: "modelo-simulado" };
  },
}));
vi.mock("@/lib/ai/provider", async (orig) => ({ ...(await orig<typeof import("@/lib/ai/provider")>()), aiAvailable: async () => true }));
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
// Detector de fuga: cualquier valor de recuperación sembrado o término de recuperación en un texto
const LEAK_VALUES = [/(?<![\d.,])77[.,]7(?!\d)/, /(?<![\d.,])6[.,]5(?!\d)/, /(?<![\d.,])43(?![\d])/];
const LEAK_KEYS = /"(recovery|hrv|sleepH|rhr|doms|readiness)"/;
const LEAK_TERMS = /\b(vfc|hrv|rmssd|readiness|sue[ñn]o|duerm\w*|descans\w*|recuper\w*|fc en reposo|rhr|doms|agujetas|sleep)\b/i;
const leaks = (text: string) => [...LEAK_VALUES.filter((r) => r.test(text)).map(String), ...(LEAK_KEYS.test(text) ? ["clave"] : []), ...(LEAK_TERMS.test(text) ? [String(text.match(LEAK_TERMS))] : [])];
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
  let coachBoth: string;
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
    await prisma.user.update({ where: { id: athlete }, data: { aiConsentAt: new Date() } });
    await prisma.athleteProfile.create({ data: { userId: athlete, birthDate: new Date(Date.UTC(2010, 0, 1)) } });
    for (const s of SCOPES) {
      coaches[s] = (await prisma.user.create({ data: { email: `si-c-${s.toLowerCase()}-${t}@test.dev`, name: `Entrenadora ${s}`, role: "COACH" } })).id;
      await prisma.coachAthlete.create({ data: { coachId: coaches[s], athleteId: athlete, status: "ACTIVE", scopes: [s], canPlan: true } });
    }
    coachBoth = (await prisma.user.create({ data: { email: `si-c-both-${t}@test.dev`, name: "Entrenadora REPORTS+RECOVERY", role: "COACH" } })).id;
    await prisma.coachAthlete.create({ data: { coachId: coachBoth, athleteId: athlete, status: "ACTIVE", scopes: ["REPORTS", "RECOVERY"], canPlan: false } });
    // Una sesión de Strava (con TSS pendiente de recalcular) y una propia
    await prisma.trainingSession.create({ data: { userId: athlete, date: day, type: "TRACK", status: "COMPLETED", durationSec: 3000, sessionRpe: 6, title: M.STRAVA, source: "STRAVA", externalId: `strava:si-${t}` } });
    await prisma.trainingSession.create({ data: { userId: athlete, date: day, type: "STRENGTH", status: "COMPLETED", durationSec: 3600, sessionRpe: 5, title: "Fuerza propia" } });
    await prisma.thresholdHistory.create({ data: { userId: athlete, effectiveFrom: day, lthr: 171, notes: M.LOAD } });
    await prisma.testResult.create({ data: { userId: athlete, testKey: "cmj", name: M.TEST, unit: "cm", higherIsBetter: true, value: 44.4, date: day } });
    exerciseId = (await prisma.exercise.create({ data: { userId: athlete, name: `${M.SESSIONS}-${t}` } })).id;
    await prisma.trainingCycle.create({ data: { userId: athlete, level: "MESO", name: M.PLANNING, startDate: day, endDate: new Date(Date.UTC(2026, 10, 7)) } });
    await prisma.calendarEvent.create({ data: { userId: athlete, type: "COMPETITION", title: M.PLANNING_EVENT, startAt: day, priority: "A" } });
    await prisma.recoveryMetrics.create({ data: { userId: athlete, date: day, hrvRmssdMs: 77.7, sleepHours: 6.5, restingHr: 43, notes: M.RECOVERY_DAY } });
    await prisma.injury.create({ data: { userId: athlete, area: "SHOULDER", pain: 4, startedOn: day, notes: M.RECOVERY } });
    curveId = (
      await prisma.referenceCurve.create({
        data: { createdById: athlete, global: true, testKey: "cmj", unit: "cm", higherIsBetter: true, title: `Curva ${t}`, study: "Estudio", authors: "Autora", year: 2020, citation: "Autora (2020).", points: [{ x: 14, p50: 40 }, { x: 16, p50: 48 }] },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.referenceCurve.deleteMany({ where: { id: curveId } });
    await prisma.user.deleteMany({ where: { id: { in: [athlete, coachBoth, ...Object.values(coaches)].filter(Boolean) } } });
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

  // v2.7.0 B4 (S1) · el texto libre de la IA no revela la recuperación si el ámbito está cerrado
  describe("informe semanal de la IA y recuperación", () => {
    const weekly = () => import("@/app/api/ai/coach/weekly/route");
    const post = async (user: typeof current, athleteId?: string) => {
      current = user;
      return (await weekly()).POST(req("/api/ai/coach/weekly", "POST", { ...(athleteId ? { athleteId } : {}), weekOf: "2026-10-05" }), undefined as never);
    };
    const get = async (user: typeof current, qs: string) => {
      current = user;
      return (await weekly()).GET(req(`/api/ai/coach/weekly?${qs}`), undefined as never);
    };

    it("el detector no es vacío: lo que el modelo devolvería sin sanear sí es una fuga", () => {
      expect(leaks(JSON.stringify(LEAKY_REPORT)).length).toBeGreaterThan(3);
    });

    it("la atleta genera con su recuperación: el prompt la lleva (la prueba no es vacía)", async () => {
      aiCalls.length = 0;
      const res = await post({ id: athlete, role: "ATHLETE" });
      expect(res.status).toBe(201);
      expect(aiCalls[0].prompt).toContain("77.7");
      expect(aiCalls[0].system).toMatch(/VFC/);
      expect(await res.text()).toContain("VFC");
    });

    it("la entrenadora solo con REPORTS lee el informe guardado por la atleta sin rastro de recuperación", async () => {
      const res = await get({ id: coaches.REPORTS, role: "COACH" }, `athleteId=${athlete}`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(leaks(text), text).toEqual([]);
      expect(text).toContain("recoveryRedacted");
      expect(text).toContain("Carga estable"); // lo que no es recuperación se conserva
    });

    it("la entrenadora con REPORTS+RECOVERY y la propia atleta sí lo leen completo", async () => {
      for (const [u, qs] of [[{ id: coachBoth, role: "COACH" as const }, `athleteId=${athlete}`], [{ id: athlete, role: "ATHLETE" as const }, ""]] as const) {
        const text = await (await get(u, qs)).text();
        expect(text).toContain("VFC");
        expect(text).toContain("77.7");
      }
    });

    it("generar con solo REPORTS: ni el prompt ni el snapshot llevan recuperación y la respuesta se sanea y se guarda saneada", async () => {
      aiCalls.length = 0;
      const res = await post({ id: coaches.REPORTS, role: "COACH" }, athlete);
      expect(res.status).toBe(201);
      expect(aiCalls).toHaveLength(1);
      expect(leaks(aiCalls[0].system + "\n" + aiCalls[0].prompt), "prompt/system enviado a la IA").toEqual([]);
      const body = await res.text();
      expect(leaks(body), body).toEqual([]);
      const stored = await prisma.coachReport.findFirstOrThrow({ where: { userId: athlete } });
      const storedText = JSON.stringify({ s: stored.inputSnapshot, t: stored.summary, r: stored.recommendations });
      expect(leaks(storedText), storedText).toEqual([]);
      expect(storedText).toContain("Carga estable");
    });

    it("la vista previa del snapshot con solo REPORTS no lleva recuperación; con RECOVERY sí", async () => {
      const qs = `athleteId=${athlete}&preview=1&weekOf=2026-10-05`;
      const reports = await (await get({ id: coaches.REPORTS, role: "COACH" }, qs)).text();
      expect(leaks(reports), reports).toEqual([]);
      const both = await (await get({ id: coachBoth, role: "COACH" }, qs)).text();
      expect(both).toContain("77.7");
    });

    it("una entrenadora sin REPORTS no accede (403) ni genera", async () => {
      expect((await get({ id: coaches.RECOVERY, role: "COACH" }, `athleteId=${athlete}`)).status).toBe(403);
      aiCalls.length = 0;
      expect((await post({ id: coaches.LOAD, role: "COACH" }, athlete)).status).toBe(403);
      expect(aiCalls).toHaveLength(0);
    });
  });
});
