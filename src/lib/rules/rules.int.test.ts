// Integración con BD real: avisos de «Mis reglas» desde el control rápido y las sesiones técnicas.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("motor de reglas (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./rules-service");
  let prefs: typeof import("./prefs-service");
  let userId: string;
  const TODAY = "2026-11-11";

  const tech = (date: string, data: { isCompetition?: boolean; attempts?: number[]; event?: "JAVELIN" | "LONG_JUMP" }) =>
    prisma.trainingSession.create({
      data: {
        userId,
        date: new Date(date),
        type: "TECHNICAL",
        technical: {
          create: {
            event: data.event ?? "JAVELIN",
            isCompetition: data.isCompetition ?? false,
            attempts: { create: (data.attempts ?? []).map((markM, order) => ({ order, markM })) },
          },
        },
      },
    });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./rules-service");
    prefs = await import("./prefs-service");
    userId = (await prisma.user.create({ data: { email: `rules-${Date.now()}@test.dev` } })).id;
    await prisma.recoveryMetrics.create({ data: { userId, date: new Date("2026-11-09"), squeezePain: 5 } });
    // 4 semanas de base con 10 lanzamientos; esta semana: competición sin intentos (6) + 8 + un salto (no cuenta).
    for (const d of ["2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03"]) await tech(d, { attempts: Array(10).fill(30) });
    await tech("2026-11-08", { attempts: Array(8).fill(30) }); // domingo: semana anterior → base de 18
    await tech("2026-11-09", { isCompetition: true });
    await tech("2026-11-10", { attempts: Array(8).fill(31) });
    await tech("2026-11-10", { event: "LONG_JUMP", attempts: Array(20).fill(5) });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("competición sin intentos = 6 y los saltos no cuentan", async () => {
    const { weeks, cap } = await svc.throwWeeks(userId, TODAY);
    expect(weeks.map((w) => w.throws)).toEqual([10, 10, 10, 18, 14]);
    expect(cap).toBe(Math.round(12 * 1.3));
  });

  it("squeeze alto y 48 h; los umbrales salen de Mis reglas", async () => {
    expect((await svc.rulesToday(userId, TODAY)).map((a) => a.id).sort()).toEqual(["squeeze", "throw-48h"]);
    await prefs.updatePrefs(userId, { squeezeMax: 6, throwMinHours: 24 });
    expect(await svc.rulesToday(userId, TODAY)).toEqual([]);
  });
});
