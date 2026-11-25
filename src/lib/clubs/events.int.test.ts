// Integración con BD real (v3.2 P): eventos del club, asistencia y cuota ligada.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
type U = { id: string; role: "ATHLETE" | "COACH" | "ADMIN" };

describe.skipIf(!HAS_DB)("eventos del club (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let ev: typeof import("./events-service");
  const t = testStamp();
  const u: Record<string, U> = {};
  const mail = (k: string) => `${k}-${t}@test.dev`;
  let orgX: string;
  let orgY: string;
  const soon = () => {
    const d = new Date(Date.now() + 3 * 864e5);
    return `${d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" })}T19:00`;
  };

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    ev = await import("./events-service");
    for (const [k, role] of [["adm", "COACH"], ["coa", "COACH"], ["at1", "ATHLETE"], ["minor", "ATHLETE"], ["out", "ATHLETE"], ["admY", "COACH"]] as const) {
      const birthDate = k === "minor" ? new Date(Date.UTC(new Date().getUTCFullYear() - 15, 0, 1)) : undefined;
      u[k] = { id: (await prisma.user.create({ data: { email: mail(k), role, passwordHash: "x", ...(birthDate ? { athleteProfile: { create: { birthDate } } } : {}) } })).id, role };
    }
    orgX = (await prisma.organization.create({ data: { name: `EV-X-${t}`, createdById: u.adm.id } })).id;
    orgY = (await prisma.organization.create({ data: { name: `EV-Y-${t}`, createdById: u.admY.id } })).id;
    const add = (orgId: string, k: string, role: "ADMIN" | "COACH" | "ATHLETE", status: "ACTIVE" | "PENDING" = "ACTIVE") =>
      prisma.orgMember.create({ data: { orgId, userId: u[k].id, role, status } });
    await add(orgX, "adm", "ADMIN");
    await add(orgX, "coa", "COACH");
    await add(orgX, "at1", "ATHLETE");
    await add(orgX, "minor", "ATHLETE");
    await add(orgY, "admY", "ADMIN");
    await add(orgY, "out", "ATHLETE");
  });
  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgX, orgY].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  it("solo el staff crea; el importe solo la administración", async () => {
    await expect(ev.createEvent(u.at1, orgX, { title: "X", startsAt: soon() })).rejects.toThrow(/no encontrado/i);
    await expect(ev.createEvent(u.coa, orgX, { title: "Con cuota", startsAt: soon(), amount: "10" })).rejects.toThrow(/administración/);
    await expect(ev.createEvent(u.admY, orgX, { title: "Ajeno", startsAt: soon() })).rejects.toThrow(/no encontrado/i);
    await ev.createEvent(u.coa, orgX, { title: "Entreno libre", startsAt: soon(), location: "Pista" });
    const paid = await ev.createEvent(u.adm, orgX, { title: "Competición", startsAt: soon(), amount: "10,50" });
    expect((await prisma.orgEvent.findUniqueOrThrow({ where: { id: paid.id } })).feeCents).toBe(1050);
  });

  it("nadie ve eventos de otro club (404) ni responde en ellos", async () => {
    await ev.createEvent(u.admY, orgY, { title: "Evento Y", startsAt: soon() });
    const evY = await prisma.orgEvent.findFirstOrThrow({ where: { orgId: orgY } });
    await expect(ev.listEvents(u.at1, orgY)).rejects.toThrow(/no encontrado/i);
    await expect(ev.listEvents(u.adm, orgY)).rejects.toThrow(/no encontrado/i);
    await expect(ev.respond(u.at1, orgY, evY.id, "YES")).rejects.toThrow(/no encontrado/i);
    // con el id del evento de Y pero el club X: tampoco
    await expect(ev.respond(u.at1, orgX, evY.id, "YES")).rejects.toThrow(/no encontrado/i);
    await expect(ev.updateEvent(u.adm, orgX, evY.id, { title: "hack" })).rejects.toThrow(/no encontrado/i);
    await expect(ev.deleteEvent(u.admY, orgX, evY.id)).rejects.toThrow(/no encontrado/i);
    expect((await ev.listEvents(u.out, orgY)).events.map((e) => e.title)).toEqual(["Evento Y"]);
    // una invitación pendiente tampoco entra
    await prisma.orgMember.update({ where: { orgId_userId: { orgId: orgY, userId: u.out.id } }, data: { status: "PENDING" } });
    await expect(ev.listEvents(u.out, orgY)).rejects.toThrow(/no encontrado/i);
  });

  it("responder en 1 toque; la atleta (y la menor) solo ve lo suyo; el staff ve el resumen con nombres", async () => {
    const paid = await prisma.orgEvent.findFirstOrThrow({ where: { orgId: orgX, title: "Competición" } });
    await ev.respond(u.at1, orgX, paid.id, "YES");
    await ev.respond(u.minor, orgX, paid.id, "MAYBE");
    for (const who of [u.at1, u.minor]) {
      const mine = (await ev.listEvents(who, orgX)).events.find((e) => e.id === paid.id)!;
      expect(mine.summary).toBeNull();
      expect(JSON.stringify(mine)).not.toContain(mail("coa"));
      expect(JSON.stringify(mine)).not.toContain(mail(who === u.at1 ? "minor" : "at1"));
    }
    expect((await ev.listEvents(u.at1, orgX)).events.find((e) => e.id === paid.id)!.myAnswer).toBe("YES");
    expect((await ev.listEvents(u.minor, orgX)).events.find((e) => e.id === paid.id)!.myAnswer).toBe("MAYBE");
    for (const staff of [u.adm, u.coa]) {
      const s = (await ev.listEvents(staff, orgX)).events.find((e) => e.id === paid.id)!.summary!;
      expect([s.yes, s.maybe, s.no, s.none]).toEqual([1, 1, 0, 2]);
      expect(s.names.YES).toEqual([mail("at1")]);
    }
  });

  it("cuota del evento: «Sí» la apunta una vez; «No» la quita si sigue pendiente; pagada se conserva", async () => {
    const paid = await prisma.orgEvent.findFirstOrThrow({ where: { orgId: orgX, title: "Competición" } });
    const fees = () => prisma.orgFee.findMany({ where: { eventId: paid.id, member: { userId: u.at1.id } } });
    await Promise.all([ev.respond(u.at1, orgX, paid.id, "YES"), ev.respond(u.at1, orgX, paid.id, "YES")]);
    expect(await fees()).toHaveLength(1);
    expect((await fees())[0]).toMatchObject({ amountCents: 1050, status: "PENDING", concept: "Competición" });
    const mine = (await ev.listEvents(u.at1, orgX)).events.find((e) => e.id === paid.id)!;
    expect(mine.myFee?.status).toBe("PENDING");
    await ev.respond(u.at1, orgX, paid.id, "NO");
    expect(await fees()).toHaveLength(0);
    await ev.respond(u.at1, orgX, paid.id, "YES");
    await prisma.orgFee.updateMany({ where: { eventId: paid.id }, data: { status: "PAID", paidAt: new Date() } });
    await ev.respond(u.at1, orgX, paid.id, "NO");
    expect((await fees())[0].status).toBe("PAID");
    // la entrenadora que responde «Sí» no genera cuota (no es atleta)
    await ev.respond(u.coa, orgX, paid.id, "YES");
    expect(await prisma.orgFee.count({ where: { eventId: paid.id, member: { userId: u.coa.id } } })).toBe(0);
  });

  it("un evento pasado no admite respuesta (409) y borrar anula cuotas pendientes", async () => {
    const past = await prisma.orgEvent.create({ data: { orgId: orgX, title: "Ya pasó", startsAt: new Date(Date.now() - 3 * 864e5) } });
    await expect(ev.respond(u.at1, orgX, past.id, "YES")).rejects.toMatchObject({ status: 409 });
    const e2 = await ev.createEvent(u.adm, orgX, { title: "Cena", startsAt: soon(), amount: "20" });
    await ev.respond(u.minor, orgX, e2.id, "YES");
    expect(await prisma.orgFee.count({ where: { eventId: e2.id } })).toBe(1);
    await ev.deleteEvent(u.coa, orgX, e2.id);
    expect(await prisma.orgFee.count({ where: { concept: "Cena", orgId: orgX } })).toBe(0);
    expect(await prisma.orgEventResponse.count({ where: { eventId: e2.id } })).toBe(0);
  });

  it("avisos sin responder: solo los míos y de mi club", async () => {
    const n = await ev.unansweredByClub(u.minor.id);
    expect(n.get(orgX)).toBeGreaterThanOrEqual(1);
    expect(n.has(orgY)).toBe(false);
  });
});
