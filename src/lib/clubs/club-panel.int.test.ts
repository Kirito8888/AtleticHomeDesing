// Rendimiento B5 · el panel del club hace las mismas consultas con 5 que con 20 atletas, y lee lo mismo que resolveAthleteId.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

// Cliente real que cuenta cada operación enviada a la BD
const counter = { n: 0, on: false };
vi.mock("@/lib/prisma", async () => {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@/generated/prisma/client");
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 5 }) });
  const prisma = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          if (counter.on) counter.n++;
          return query(args);
        },
      },
    },
  });
  return { prisma };
});

const HAS_DB = Boolean(process.env.DATABASE_URL);
const TITLE = "Rodaje importado de Strava";

describe.skipIf(!HAS_DB)("panel del club en lote (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let panel: typeof import("./club-panel");
  let session: typeof import("@/lib/auth/session");
  const t = Date.now();
  const orgs: string[] = [];
  let seq = 0;
  let coach: { id: string; role: "COACH" };
  const day = new Date(Date.UTC(2026, 9, 7));

  async function club(n: number) {
    const k = seq++;
    const ids: string[] = [];
    const members = [{ userId: coach.id, role: "ADMIN" as const, status: "ACTIVE" as const }];
    for (let i = 0; i < n; i++) {
      const id = (await prisma.user.create({ data: { email: `cp${k}-${i}-${t}@test.dev`, name: `At ${i}`, processingRestrictedAt: i === 1 ? new Date() : null } })).id;
      ids.push(id);
      members.push({
        userId: id,
        role: "ATHLETE" as never,
        status: (i === 2 ? "PENDING" : "ACTIVE") as never,
        ...({ scopes: i % 2 ? ["SESSIONS", "RECOVERY"] : ["SESSIONS", "LOAD", "PLANNING", "RECOVERY"] } as object),
      });
      await prisma.trainingSession.create({ data: { userId: id, date: day, type: "TRACK", status: "COMPLETED", durationSec: 3000, title: TITLE, source: "STRAVA", externalId: `s:${k}:${i}:${t}` } });
      await prisma.trainingSession.create({ data: { userId: id, date: day, type: "STRENGTH", status: "COMPLETED", durationSec: 3600, title: "Fuerza propia" } });
    }
    const org = await prisma.organization.create({ data: { name: `Club B5 ${k} ${t}`, members: { create: members } } });
    orgs.push(org.id);
    return { orgId: org.id, ids };
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    panel = await import("./club-panel");
    session = await import("@/lib/auth/session");
    coach = { id: (await prisma.user.create({ data: { email: `cpc-${t}@test.dev`, role: "COACH" } })).id, role: "COACH" };
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  async function count(orgId: string) {
    counter.n = 0;
    counter.on = true;
    try {
      await panel.loadClubPanel(coach, orgId);
    } finally {
      counter.on = false;
    }
    return counter.n;
  }

  it("mismo nº de consultas con 5 que con 20 atletas", async () => {
    const small = await club(5);
    const big = await club(20);
    const a = await count(small.orgId);
    const b = await count(big.orgId);
    expect(b).toBe(a);
    expect(a).toBeLessThan(25);
  });

  it("readableScopes coincide con resolveAthleteId (ámbito, PENDING, art. 18) y Strava no sale", async () => {
    const { orgId, ids } = await club(5);
    const scopes = await session.readableScopes(coach, ids);
    for (const id of ids) {
      for (const sc of ["LOAD", "SESSIONS", "RECOVERY", "PLANNING", "REPORTS"] as const) {
        const ok = await session.resolveAthleteId(coach, id, sc).then(() => true, () => false);
        expect(scopes.get(id)?.has(sc) ?? false, `${id} ${sc}`).toBe(ok);
      }
    }
    expect(scopes.get(ids[1])).toBeUndefined(); // limitación del tratamiento
    expect(scopes.get(ids[2])).toBeUndefined(); // invitación sin aceptar
    const p = await panel.loadClubPanel(coach, orgId);
    expect(JSON.stringify({ c: p.calendar, m: p.compare, a: p.alerts })).not.toContain(TITLE);
    expect(p.calendar.every((e) => e.athlete !== "At 1" && e.athlete !== "At 2")).toBe(true);
  });
});
