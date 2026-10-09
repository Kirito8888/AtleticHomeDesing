// Integración con BD real (v1.6): jabalina (claves, previsión), importación de Apple Health, suplementos y citas.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("jabalina y salud (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let userId: string;

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    userId = (await prisma.user.create({ data: { email: `v16ad-${Date.now()}@test.dev` } })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("lee las sesiones de jabalina con su clave técnica y calcula las claves", async () => {
    const mk = async (date: string, marks: number[], cue: string | null, isCompetition = false) => {
      const s = await prisma.trainingSession.create({ data: { userId, date: new Date(date), type: "TECHNICAL" } });
      await prisma.technicalSession.create({
        data: { sessionId: s.id, event: "JAVELIN", implementWeightG: 800, cue, isCompetition, attempts: { create: marks.map((m, i) => ({ order: i + 1, markM: m })) } },
      });
    };
    await mk("2026-09-01", [48, 50], null);
    await mk("2026-09-03", [52, 54], "brazo largo");
    await mk("2026-09-05", [49, 51, 0], null);
    const { javelinSessions } = await import("./javelin-service");
    const { cueStats } = await import("./javelin-insights");
    const ss = await javelinSessions(userId);
    expect(ss).toHaveLength(3);
    expect(cueStats(ss)[0]).toMatchObject({ cue: "brazo largo", sessions: 1 });
  });

  it("importar días de Apple Health solo toca sueño y FC en reposo", async () => {
    await prisma.recoveryMetrics.create({ data: { userId, date: new Date("2026-10-08"), squeezePain: 2 } });
    const { saveRecoveryRows } = await import("@/lib/recovery/hrv-import-service");
    await saveRecoveryRows(userId, [{ date: "2026-10-08", hrvRmssdMs: null, restingHr: 54, sleepHours: 7.5 }]);
    const r = await prisma.recoveryMetrics.findFirstOrThrow({ where: { userId, date: new Date("2026-10-08") } });
    expect(r).toMatchObject({ squeezePain: 2, restingHr: 54, sleepHours: 7.5 });
  });

  it("aviso de la cita la tarde anterior, una sola vez", async () => {
    await prisma.pushSubscription.create({ data: { userId, endpoint: `https://push.example/ad-${Date.now()}`, p256dh: "B".repeat(87), auth: "A".repeat(22) } });
    await prisma.appointment.create({ data: { userId, kind: "PHYSIO", at: new Date(Date.now() + 20 * 3600e3) } });
    const { runAppointmentReminders } = await import("@/lib/scheduler");
    const madridHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    const first = await runAppointmentReminders();
    if (madridHour >= 19) {
      expect(first).toBeGreaterThanOrEqual(1);
      expect(await runAppointmentReminders()).toBe(0);
    } else expect(first).toBe(0);
  });
});
