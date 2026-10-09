// Integración con BD real (v1.6): salud ósea cifrada, informe para la médica con token y «entreno sola».
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && Boolean(process.env.TOTP_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY);

describe.skipIf(!HAS_DB)("mujeres v1.6 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let her: string;
  let friend: string;
  let stranger: string;

  beforeAll(async () => {
    const { generateVapidKeys } = await import("@/lib/push/send");
    const k = generateVapidKeys();
    vi.stubEnv("VAPID_PUBLIC_KEY", k.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", k.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    prisma = (await import("@/lib/prisma")).prisma;
    const t = Date.now();
    her = (await prisma.user.create({ data: { email: `w16-${t}@test.dev`, name: "Atleta", athleteProfile: { create: { sex: "FEMALE" } } } })).id;
    friend = (await prisma.user.create({ data: { email: `w16f-${t}@test.dev`, name: "Amiga" } })).id;
    stranger = (await prisma.user.create({ data: { email: `w16s-${t}@test.dev` } })).id;
    for (const [userId, n] of [
      [friend, 1],
      [stranger, 2],
      [her, 3],
    ] as const) {
      await prisma.pushSubscription.create({ data: { userId, endpoint: `https://push.example/w16-${t}-${n}`, p256dh: "B".repeat(87), auth: "A".repeat(22) } });
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [her, friend, stranger].filter(Boolean) } } });
    vi.unstubAllEnvs();
  });

  it("salud ósea cifrada y con aviso", async () => {
    const svc = await import("./women-service");
    await svc.addHealthLog(her, { kind: "BONE", date: "2026-10-08", stressFractures: 2, calciumServings: 1 });
    const raw = await prisma.healthLog.findMany({ where: { userId: her } });
    expect(raw.map((r) => r.data).join(" ")).not.toMatch(/BONE|stressFractures|calcium/);
    const o = await svc.womenOverview(her, "2026-10-09");
    expect(o.bone?.level).toBe("red");
    expect(o.alerts.map((a) => a.id)).toContain("bone-red");
  });

  it("informe para la médica: token, contenido, caducidad y revocación", async () => {
    const svc = await import("./women-service");
    await svc.addHealthLog(her, { kind: "LAB", date: "2026-10-01", values: { ferritin: 14 } });
    const rep = await import("./health-report");
    const { token } = await rep.createHealthReport(her, "MEDICAL");
    const html = (await rep.healthReportHtml(token))!;
    expect(html).toContain("Resumen para tu médica");
    expect(html).toContain("14");
    expect(html).not.toMatch(/<script/i);
    expect(await rep.healthReportHtml(token, new Date(Date.now() + 8 * 864e5))).toBeNull();
    const [r] = await rep.listHealthReports(her);
    await rep.revokeHealthReport(her, r.id);
    expect(await rep.healthReportHtml(token)).toBeNull();
    await expect(rep.revokeHealthReport(stranger, r.id)).rejects.toThrow(/no encontrado/);
    expect(await rep.healthReportHtml("x".repeat(43))).toBeNull();
  });

  it("entreno sola: solo los contactos aceptados reciben el aviso, una vez", async () => {
    const safety = await import("./safety-service");
    await safety.inviteContact(her, (await prisma.user.findUniqueOrThrow({ where: { id: friend } })).email);
    await safety.inviteContact(her, (await prisma.user.findUniqueOrThrow({ where: { id: stranger } })).email);
    const links = await prisma.safetyContact.findMany({ where: { userId: her } });
    await safety.setContactStatus(friend, links.find((l) => l.contactId === friend)!.id, "ACTIVE");
    await expect(safety.setContactStatus(her, links.find((l) => l.contactId === stranger)!.id, "ACTIVE")).rejects.toThrow(/invitada/);
    await safety.startTrip(her, { minutes: 30, note: "Pista", lat: 42.34, lon: -3.69 });
    const trip = await prisma.safetyTrip.findFirstOrThrow({ where: { userId: her } });
    expect(trip.data).not.toMatch(/Pista|42\.34/);
    const sent: string[] = [];
    const send = async (t: { endpoint: string }) => (sent.push(t.endpoint), { ok: true as const });
    expect(await safety.runSafetyJob(new Date(Date.now() + 10 * 60_000), send)).toBe(0);
    expect(await safety.runSafetyJob(new Date(Date.now() + 31 * 60_000), send)).toBe(1);
    expect(sent.map((e) => e.slice(-1)).sort()).toEqual(["1", "3"]);
    expect(await safety.runSafetyJob(new Date(Date.now() + 60 * 60_000), send)).toBe(0);
    const o = await safety.safetyOverview(friend);
    expect(o.watchingTrips[0]).toMatchObject({ name: "Atleta", overdue: false }); // con el reloj real aún no ha vencido
    await safety.endTrip(her, send);
    expect(sent).toHaveLength(3);
    expect((await safety.safetyOverview(friend)).watchingTrips).toEqual([]);
  });
});
