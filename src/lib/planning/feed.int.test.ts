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
