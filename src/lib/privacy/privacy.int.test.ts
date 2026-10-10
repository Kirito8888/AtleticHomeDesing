// Integración con BD real (v1.7): limitación del tratamiento, consentimientos y plazos de conservación.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("privacidad v1.7 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let athlete: string;
  let coach: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./service");
    const t = Date.now();
    athlete = (await prisma.user.create({ data: { email: `pv1-${t}@test.dev`, aiConsentAt: new Date() } })).id;
    coach = (await prisma.user.create({ data: { email: `pv2-${t}@test.dev`, role: "COACH" } })).id;
    await prisma.coachAthlete.create({ data: { coachId: coach, athleteId: athlete, status: "ACTIVE", scopes: ["SESSIONS"] } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [athlete, coach] } } });
  });

  it("la limitación corta entrenador, enlaces y calendario; levantarla lo devuelve", async () => {
    const { resolveAthleteId } = await import("@/lib/auth/session");
    const { createFeed, feedIcs } = await import("@/lib/planning/feed-service");
    const coachUser = { id: coach, role: "COACH" } as Parameters<typeof resolveAthleteId>[0];
    const token = await createFeed(athlete);
    expect(await resolveAthleteId(coachUser, athlete, "SESSIONS")).toBe(athlete);

    await svc.setRestriction(athlete, true);
    await expect(resolveAthleteId(coachUser, athlete, "SESSIONS")).rejects.toThrow(/limitado/);
    await expect(createFeed(athlete)).rejects.toThrow(/limitado/);
    expect(await feedIcs(token)).toBeNull();

    await svc.setRestriction(athlete, false);
    expect(await resolveAthleteId(coachUser, athlete, "SESSIONS")).toBe(athlete);
    expect(await feedIcs(token)).toContain("BEGIN:VCALENDAR");
    const reqs = await prisma.privacyRequest.findMany({ where: { userId: athlete } });
    expect(reqs.map((r) => [r.right, r.detail])).toEqual(expect.arrayContaining([["RESTRICTION", "activada"], ["RESTRICTION", "levantada"]]));
  });

  it("los consentimientos quedan con su versión e historial", async () => {
    await svc.recordConsent(athlete, "AI", true);
    await svc.recordConsent(athlete, "AI", false);
    await svc.ensureHealthConsent(athlete);
    await svc.ensureHealthConsent(athlete); // no duplica
    const o = await svc.consentOverview(athlete);
    expect(o.current.AI?.granted).toBe(false);
    expect(o.current.HEALTH).toMatchObject({ granted: true, version: svc.CONSENT_TEXT.HEALTH.version });
    expect(o.history.filter((h) => h.purpose === "HEALTH")).toHaveLength(1);
  });

  it("conservación: borra salidas antiguas de «entreno sola» y retos caducados, no lo reciente", async () => {
    const { pruneAuditJob } = await import("@/lib/scheduler");
    const now = new Date("2026-10-10T12:00:00Z");
    await prisma.safetyTrip.createMany({
      data: [
        { userId: athlete, startedAt: new Date("2026-05-01"), dueAt: new Date("2026-05-01"), endedAt: new Date("2026-05-01T02:00:00Z") },
        { userId: athlete, startedAt: new Date("2026-10-09"), dueAt: new Date("2026-10-09"), endedAt: new Date("2026-10-09T02:00:00Z") },
      ],
    });
    await prisma.webAuthnChallenge.create({ data: { kind: "LOGIN", challenge: "x", expiresAt: new Date("2026-10-10T11:00:00Z") } });
    await pruneAuditJob(now);
    expect(await prisma.safetyTrip.count({ where: { userId: athlete } })).toBe(1);
    expect(await prisma.webAuthnChallenge.count({ where: { expiresAt: { lt: now } } })).toBe(0);
  });
});
