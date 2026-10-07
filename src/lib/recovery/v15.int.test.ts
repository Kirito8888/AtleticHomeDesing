// Integración con BD real: importar VFC sin pisar el resto, vuelta por fases e hidratación.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("recuperación v1.5 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let userId: string;

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    prisma = (await import("@/lib/prisma")).prisma;
    userId = (await prisma.user.create({ data: { email: `rec15-${Date.now()}@test.dev`, athleteProfile: { create: { bodyWeightKg: 70 } } } })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("CSV de VFC: solo escribe VFC, FC y sueño; recuerda el mapeo", async () => {
    await prisma.recoveryMetrics.create({ data: { userId, date: new Date("2026-10-05"), squeezePain: 2, mood: 4 } });
    const { importHrvCsv } = await import("./hrv-import-service");
    const csv = "fecha;rmssd;sueño\n05/10/2026;82;7,5\n06/10/2026;90;8\n";
    const m = { delimiter: ";" as const, dateCol: 0, dateFormat: "DD/MM/YYYY" as const, hrvCol: 1, rhrCol: null, sleepCol: 2, sleepUnit: "h" as const };
    expect(await importHrvCsv(userId, csv, m, false)).toMatchObject({ total: 2 });
    expect(await importHrvCsv(userId, csv, m, true)).toEqual({ imported: 2, errors: 0 });
    const d5 = await prisma.recoveryMetrics.findUniqueOrThrow({ where: { userId_date: { userId, date: new Date("2026-10-05") } } });
    expect(d5).toMatchObject({ hrvRmssdMs: 82, sleepHours: 7.5, squeezePain: 2, mood: 4 });
    const { getPrefs } = await import("@/lib/rules/prefs-service");
    expect((await getPrefs(userId)).hrvCsvMapping).toMatchObject({ dateFormat: "DD/MM/YYYY", hrvCol: 1 });
  });

  it("vuelta por fases: plantilla, criterios y avisos", async () => {
    const inj = await prisma.injury.create({ data: { userId, area: "ELBOW", pain: 2, startedOn: new Date("2026-10-01") } });
    const svc = await import("./protocol-service");
    const p = await svc.startProtocol(userId, inj.id);
    const phases = svc.readProtocol(p.phases)!;
    expect(phases[3].name).toMatch(/Lanzamientos/);
    phases[0].criteria.forEach((c) => (c.done = true));
    expect((await svc.saveProtocol(userId, inj.id, phases)).current).toBe(1);
    const { rulesToday } = await import("@/lib/rules/rules-service");
    expect((await rulesToday(userId, "2026-10-07")).map((a) => a.title)).toContain("Vuelta tras lesión: 2 · Fuerza sin dolor");
  });

  it("agua: suma del día, objetivo y deshacer", async () => {
    const h = await import("@/lib/nutrition/hydration-service");
    await h.addWater(userId, { date: "2026-10-07", ml: 500 });
    await h.addWater(userId, { date: "2026-10-07", ml: 250 });
    expect(await h.hydrationDay(userId, "2026-10-07")).toMatchObject({ ml: 750, target: 2450, hot: false });
    await h.undoWater(userId, "2026-10-07");
    expect((await h.hydrationDay(userId, "2026-10-07")).ml).toBe(500);
  });
});
