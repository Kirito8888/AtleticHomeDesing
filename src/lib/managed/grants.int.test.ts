// Integración con BD real (v3.3 E2): permiso implícito de la entrenadora sobre sus fichas.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("permisos sobre fichas gestionadas (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let session: typeof import("@/lib/auth/session");
  let multi: typeof import("@/lib/coach/multi-plan");
  let svc: typeof import("./service");
  const t = testStamp();
  const ids: string[] = [];
  let owner: { id: string; role: "COACH" };
  let other: { id: string; role: "COACH" };
  let admin: { id: string; role: "ADMIN" };
  let ficha: string;

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    session = await import("@/lib/auth/session");
    multi = await import("@/lib/coach/multi-plan");
    svc = await import("./service");
    const mk = async <R extends "COACH" | "ADMIN">(k: string, role: R) => {
      const u = await prisma.user.create({ data: { email: `gr-${k}-${t}@test.dev`, role, passwordHash: "x" } });
      ids.push(u.id);
      return { id: u.id, role };
    };
    owner = await mk("owner", "COACH");
    other = await mk("other", "COACH");
    admin = await mk("admin", "ADMIN");
    ficha = (await svc.createManagedAthlete(owner, { alias: `F ${t}`, category: "Sub-18", consent: true })).userId;
  });

  afterAll(async () => {
    await prisma.managedAthlete.deleteMany({ where: { coachId: { in: ids } } });
    await prisma.user.deleteMany({ where: { managedById: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });

  it("la dueña lee y planifica LOAD, SESSIONS, PLANNING y REPORTS, pero nunca RECOVERY", async () => {
    for (const scope of ["LOAD", "SESSIONS", "PLANNING", "REPORTS"] as const) {
      await expect(session.resolveAthleteId(owner, ficha, scope)).resolves.toBe(ficha);
      await expect(session.resolveAthleteId(owner, ficha, scope, "write")).resolves.toBe(ficha);
    }
    await expect(session.resolveAthleteId(owner, ficha, "RECOVERY")).rejects.toMatchObject({ status: 403 });
  });

  it("otra entrenadora y un ADMIN global sin ser la dueña no acceden", async () => {
    await expect(session.resolveAthleteId(other, ficha, "LOAD")).rejects.toMatchObject({ status: 403 });
    await expect(session.resolveAthleteId(admin, ficha, "LOAD")).rejects.toMatchObject({ status: 403 });
    const m = await session.readableScopes(other, [ficha]);
    expect(m.get(ficha)).toBeUndefined();
  });

  it("readableScopes da a la dueña los ámbitos sin RECOVERY", async () => {
    const m = await session.readableScopes(owner, [ficha]);
    expect([...(m.get(ficha) ?? [])].sort()).toEqual(["LOAD", "PLANNING", "REPORTS", "SESSIONS"]);
  });

  it("multi-plan: la ficha activa aparece para la dueña (y solo para ella)", async () => {
    const mine = await multi.multiPlanOverview(owner);
    expect(mine.athletes.find((a) => a.id === ficha)).toMatchObject({ eligible: true });
    expect((await multi.multiPlanOverview(other)).athletes.some((a) => a.id === ficha)).toBe(false);
  });

  it("limitación del tratamiento (art. 18) bloquea aunque sea la dueña", async () => {
    await prisma.user.update({ where: { id: ficha }, data: { processingRestrictedAt: new Date() } });
    await expect(session.resolveAthleteId(owner, ficha, "LOAD")).rejects.toMatchObject({ status: 403 });
    await prisma.user.update({ where: { id: ficha }, data: { processingRestrictedAt: null } });
  });

  it("archivada = solo lectura y fuera de multi-plan", async () => {
    await prisma.managedAthlete.update({ where: { userId: ficha }, data: { archivedAt: new Date() } });
    await expect(session.resolveAthleteId(owner, ficha, "LOAD")).resolves.toBe(ficha);
    await expect(session.resolveAthleteId(owner, ficha, "PLANNING", "write")).rejects.toMatchObject({ status: 403 });
    expect((await multi.multiPlanOverview(owner)).athletes.some((a) => a.id === ficha)).toBe(false);
  });
});
