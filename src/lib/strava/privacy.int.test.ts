// v2.2 · Privacidad transversal: lo importado de Strava no sale de la atleta (entrenadora, informe compartido, IA).
// Si una ruta nueva lee sesiones de otra persona y no pasa por `notFromStrava`, este test es el sitio donde añadirla.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let current: { id: string; role: "ATHLETE" | "COACH" } = { id: "", role: "ATHLETE" };
vi.mock("@/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", async (orig) => ({ ...(await orig<typeof import("@/lib/auth/session")>()), requireUser: async () => current }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const TITLE = "Rodaje importado de Strava";

describe.skipIf(!HAS_DB)("Strava no llega a terceros (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let athlete: string;
  let coach: string;
  let stravaId: string;
  let ownId: string;
  const t = Date.now();
  const day = new Date(Date.UTC(2026, 9, 7));
  const req = (url: string) => new NextRequest(`http://localhost${url}`);

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    athlete = (await prisma.user.create({ data: { email: `pa-${t}@test.dev`, name: "Atleta" } })).id;
    coach = (await prisma.user.create({ data: { email: `pc-${t}@test.dev`, name: "Entrenadora", role: "COACH" } })).id;
    await prisma.coachAthlete.create({ data: { coachId: coach, athleteId: athlete, status: "ACTIVE", scopes: ["SESSIONS", "LOAD", "REPORTS"], canPlan: true } });
    stravaId = (await prisma.trainingSession.create({ data: { userId: athlete, date: day, type: "TRACK", status: "COMPLETED", durationSec: 3000, tss: 55, title: TITLE, source: "STRAVA", externalId: `strava:${t}` } })).id;
    ownId = (await prisma.trainingSession.create({ data: { userId: athlete, date: day, type: "STRENGTH", status: "COMPLETED", durationSec: 3600, tss: 40, title: "Fuerza propia" } })).id;
    await prisma.personalRecord.create({ data: { userId: athlete, kind: "TECHNICAL_MARK", value: 40, achievedOn: day, sessionId: stravaId } });
    await prisma.personalRecord.create({ data: { userId: athlete, kind: "TECHNICAL_MARK", value: 41, achievedOn: day, sessionId: ownId } });
    await prisma.recoveryMetrics.create({ data: { userId: athlete, date: day, hrvRmssdMs: 77.7, sleepHours: 6.5 } });
    await prisma.sessionComment.create({ data: { sessionId: stravaId, athleteId: athlete, authorId: athlete, body: "nota privada" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [athlete, coach].filter(Boolean) } } });
  });

  it("la vista de la entrenadora solo lleva la sesión propia", async () => {
    const { coachOverview, coachSessionDetail } = await import("@/lib/coach/overview");
    const o = await coachOverview({ id: coach, role: "COACH" });
    expect(o.sessions.map((s) => s.id)).toEqual([ownId]);
    expect(await coachSessionDetail({ id: coach, role: "COACH" }, stravaId, athlete)).toBeNull();
    expect((await coachSessionDetail({ id: coach, role: "COACH" }, ownId, athlete))?.session.id).toBe(ownId);
  });

  it("el hilo de comentarios de una sesión de Strava da 404 a la entrenadora, no a la atleta", async () => {
    const svc = await import("@/lib/training/comments-service");
    await expect(svc.sessionThread({ id: coach, role: "COACH" }, stravaId, athlete)).rejects.toMatchObject({ status: 404 });
    await expect(svc.addComment({ id: coach, role: "COACH" }, stravaId, athlete, "hola")).rejects.toMatchObject({ status: 404 });
    expect(await svc.sessionThread({ id: athlete, role: "ATHLETE" }, stravaId, null)).toHaveLength(1);
  });

  it("API: sesiones, marcas y carga", async () => {
    current = { id: coach, role: "COACH" };
    const sessions = await import("@/app/api/training/sessions/route");
    const one = await import("@/app/api/training/sessions/[id]/route");
    const records = await import("@/app/api/training/records/route");
    const pmc = await import("@/app/api/training/pmc/route");
    const list = await (await sessions.GET(req(`/api/training/sessions?athleteId=${athlete}`), undefined as never)).text();
    expect(list).not.toContain(TITLE);
    expect((await one.GET(req(`/api/training/sessions/${stravaId}?athleteId=${athlete}`), { params: Promise.resolve({ id: stravaId }) } as never)).status).toBe(404);
    const prs = (await (await records.GET(req(`/api/training/records?athleteId=${athlete}`), undefined as never)).json()) as Array<{ value: number }>;
    expect(prs.map((p) => p.value)).toEqual([41]);
    const load = (await (await pmc.GET(req(`/api/training/pmc?athleteId=${athlete}&days=30`), undefined as never)).json()) as { loadHidden?: boolean; series: Array<Record<string, unknown>> };
    expect(load.loadHidden).toBe(true);
    expect(load.series.every((r) => !("ctl" in r) && !("tss" in r))).toBe(true);
    // La atleta sí ve lo suyo
    current = { id: athlete, role: "ATHLETE" };
    const mine = (await (await records.GET(req("/api/training/records"), undefined as never)).json()) as unknown[];
    expect(mine).toHaveLength(2);
    const own = (await (await pmc.GET(req("/api/training/pmc?days=30"), undefined as never)).json()) as { loadHidden?: boolean };
    expect(own.loadHidden).toBeUndefined();
  });

  it("el informe compartido por enlace no lista la de Strava", async () => {
    const { createReport, reportHtml } = await import("@/lib/report/service");
    const { token } = await createReport(athlete, { from: "2026-10-01", to: "2026-10-31", includeInjuries: false });
    const html = (await reportHtml(token)) ?? "";
    expect(html).toContain("Fuerza propia");
    expect(html).not.toContain(TITLE);
  });

  it("la IA (resumen y semana) tampoco la recibe", async () => {
    const { trainingSummary } = await import("@/lib/ai/data-ai");
    const { buildWeeklySnapshot } = await import("@/lib/ai/coach");
    const s = JSON.stringify(await trainingSummary(athlete, "2026-10-08"));
    expect(s).not.toContain(TITLE);
    const w = JSON.stringify(await buildWeeklySnapshot(athlete, new Date(Date.UTC(2026, 9, 5))));
    expect(w).not.toContain(TITLE);
  });

  it("v2.3 B3 · el panel del club (cumplimiento y calendario) no lleva la sesión de Strava", async () => {
    const { loadClubPanel } = await import("@/lib/clubs/club-panel");
    const org = await prisma.organization.create({
      data: {
        name: `Club privacidad ${t}`,
        members: {
          create: [
            { userId: coach, role: "ADMIN", status: "ACTIVE" },
            { userId: athlete, role: "ATHLETE", status: "ACTIVE", scopes: ["SESSIONS", "LOAD", "PLANNING"] },
          ],
        },
      },
    });
    try {
      const panel = await loadClubPanel({ id: coach, role: "COACH" }, org.id);
      const json = JSON.stringify({ calendar: panel.calendar, compare: panel.compare, alerts: panel.alerts });
      expect(json).not.toContain(TITLE);
      expect(json).not.toContain("notas");
    } finally {
      await prisma.organization.delete({ where: { id: org.id } });
    }
  });

  it("v2.3 B3 · la vista previa de «planificar varios» no simula con carga de Strava", async () => {
    const { previewAssignment } = await import("@/lib/coach/multi-plan");
    await prisma.coachAthlete.updateMany({ where: { coachId: coach, athleteId: athlete }, data: { scopes: ["SESSIONS", "LOAD", "REPORTS", "PLANNING"] } });
    const tpl = await prisma.weekTemplate.create({ data: { userId: coach, name: `tpl-${t}`, days: [{ weekday: 6, title: "Rodaje largo", durationMin: 60, type: "RUN" }] } });
    const monday = new Date(Date.now() + 14 * 864e5);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const r = await previewAssignment({ id: coach, role: "COACH" }, { source: { kind: "template", id: tpl.id }, start: monday.toISOString().slice(0, 10), athleteIds: [athlete], rpe: 6 });
    const a = r.athletes.find((x) => x.id === athlete);
    expect(a?.simulation).toBeNull();
    expect(a?.simulationNote).toMatch(/Strava/);
    expect(JSON.stringify(r)).not.toContain(TITLE);
  });
  it("v2.5 · el ADMIN global no lee a una atleta sin vínculo (misma regla que una entrenadora)", async () => {
    const admin = (await prisma.user.create({ data: { email: `pad-${t}@test.dev`, name: "Admin", role: "ADMIN" } })).id;
    try {
      current = { id: admin, role: "ADMIN" as never };
      const sessions = await import("@/app/api/training/sessions/route");
      expect((await sessions.GET(req(`/api/training/sessions?athleteId=${athlete}`), undefined as never)).status).toBe(403);
    } finally {
      await prisma.user.delete({ where: { id: admin } });
    }
  });

  it("v2.5 · informe semanal: con solo REPORTS no se ve la recuperación; la atleta sí", async () => {
    const weekly = await import("@/app/api/ai/coach/weekly/route");
    current = { id: coach, role: "COACH" };
    const r = await weekly.GET(req(`/api/ai/coach/weekly?athleteId=${athlete}&preview=1&weekOf=2026-10-05`), undefined as never);
    const asCoach = JSON.stringify(await r.json());
    expect(asCoach).not.toContain("77.7");
    expect(asCoach).not.toContain('"recovery"');
    current = { id: athlete, role: "ATHLETE" };
    const own = JSON.stringify(await (await weekly.GET(req("/api/ai/coach/weekly?preview=1&weekOf=2026-10-05"), undefined as never)).json());
    expect(own).toContain("77.7");
  });

  it("v2.5 · el .ics (Google/Apple Calendar) no lleva la sesión de Strava", async () => {
    const { createFeed, feedIcs } = await import("@/lib/planning/feed-service");
    const ics = (await feedIcs(await createFeed(athlete))) ?? "";
    expect(ics).toContain("Fuerza propia");
    expect(ics).not.toContain(TITLE);
  });
});
