// Integración con BD real: calendario .ics con token (sin datos de salud, revocable).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("calendario .ics (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./feed-service");
  let userId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./feed-service");
    const { today } = await import("@/lib/dates");
    userId = (await prisma.user.create({ data: { email: `ics-${Date.now()}@test.dev` } })).id;
    await prisma.trainingSession.create({ data: { userId, date: today(), type: "STRENGTH", status: "PLANNED", title: "Fuerza A (versión suave)", notes: "NOTA-PRIVADA" } });
    await prisma.calendarEvent.create({ data: { userId, type: "COMPETITION", title: "Control de lanzamientos", startAt: today(), location: "Pista municipal", description: "DESCRIPCION-PRIVADA" } });
    await prisma.recoveryMetrics.create({ data: { userId, date: today(), squeezePain: 7, notes: "SALUD-PRIVADA" } });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("solo títulos, fechas y lugar; sin «versión suave», notas ni salud", async () => {
    const token = await svc.createFeed(userId);
    const ics = (await svc.feedIcs(token))!;
    expect(ics).toContain("SUMMARY:Fuerza A\r\n");
    expect(ics).toContain("SUMMARY:Control de lanzamientos");
    expect(ics).toContain("LOCATION:Pista municipal");
    expect(ics).not.toMatch(/versión suave|NOTA-PRIVADA|DESCRIPCION-PRIVADA|SALUD-PRIVADA|squeeze/i);
    expect((await prisma.calendarFeed.findFirst({ where: { userId } }))?.tokenHash).not.toBe(token);
  });

  it("eventos del club (v3.2 Q): entran con club, hora y lugar; sin importe; no los de «No» ni los de otro club", async () => {
    const org = await prisma.organization.create({ data: { name: "Club ICS", createdById: userId } });
    const other = await prisma.organization.create({ data: { name: "Club Ajeno", createdById: userId } });
    const member = await prisma.orgMember.create({ data: { orgId: org.id, userId, role: "ATHLETE", status: "ACTIVE" } });
    const soon = new Date(Date.now() + 3 * 864e5);
    await prisma.orgEvent.create({ data: { orgId: org.id, title: "Salida larga", startsAt: soon, location: "Parque", feeCents: 9900 } });
    const no = await prisma.orgEvent.create({ data: { orgId: org.id, title: "Descartado", startsAt: soon } });
    await prisma.orgEventResponse.create({ data: { eventId: no.id, memberId: member.id, answer: "NO" } });
    await prisma.orgEvent.create({ data: { orgId: other.id, title: "De otro club", startsAt: soon } });
    const { AUTHORSHIP_NOTICE } = await import("@/lib/legal/notice");
    const ics = (await svc.feedIcs(await svc.createFeed(userId)))!.replace(/\r\n[ \t]/g, "");
    expect(ics).toContain("SUMMARY:Club ICS · Salida larga");
    expect(ics).toContain("LOCATION:Parque");
    expect(ics).toContain(`X-WR-CALDESC:${AUTHORSHIP_NOTICE.replace(/,/g, "\\,")}`);
    expect(ics).not.toMatch(/Descartado|De otro club|99|€/);
    await prisma.organization.deleteMany({ where: { id: { in: [org.id, other.id] } } });
  });

  it("un enlace nuevo invalida el anterior; revocar lo apaga; basura → null", async () => {
    const a = await svc.createFeed(userId);
    const b = await svc.createFeed(userId);
    expect(await svc.feedIcs(a)).toBeNull();
    expect(await svc.feedIcs(b)).not.toBeNull();
    await svc.revokeFeeds(userId);
    expect(await svc.feedIcs(b)).toBeNull();
    expect(await svc.feedIcs("' OR 1=1 --")).toBeNull();
  });
});
