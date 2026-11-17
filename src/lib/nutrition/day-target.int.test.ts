// Integración con BD real: objetivo efectivo del día (sesión > día de la semana > manual > base). Datos sintéticos.
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("objetivo del día (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./service");
  let view: typeof import("./day-view");
  let userId: string;
  let noGoal: string;
  // 2026-11-16 lunes (fuerza), 17 martes (libre), 18 miércoles (competición), 19 jueves (sin nada)
  const rule = (o: object) => ({ mode: "delta", kcal: null, proteinG: null, carbsG: null, fatG: null, ...o });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./service");
    view = await import("./day-view");
    const t = `${testStamp()}-${randomBytes(3).toString("hex")}`;
    userId = (await prisma.user.create({ data: { email: `dt1-${t}@test.dev` } })).id;
    noGoal = (await prisma.user.create({ data: { email: `dt2-${t}@test.dev` } })).id;
    await prisma.nutritionGoal.create({ data: { userId, effectiveFrom: new Date("2026-01-01"), kcal: 2400, proteinG: 120, carbsG: 300, fatG: 70, trainingDayKcalFactor: 1 } });
    await prisma.trainingSession.create({ data: { userId, date: new Date("2026-11-16"), type: "STRENGTH", status: "PLANNED", strength: { create: {} } } });
    await prisma.calendarEvent.create({ data: { userId, type: "COMPETITION", title: "Prueba", startAt: new Date("2026-11-18") } });
    await prisma.athleteProfile.create({
      data: {
        userId,
        prefs: {
          macroRules: { bySession: { strength: rule({ carbsG: 60 }), long: rule({ mode: "set", carbsG: 450 }) }, byWeekday: { "2": rule({ kcal: -200 }) } },
        },
      },
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, noGoal] } } });
  });

  it("sesión de fuerza planificada → regla de la sesión", async () => {
    const d = (await view.nutritionDayView(userId, "2026-11-16")).day;
    expect(d.target.source).toBe("session");
    expect(d.goal).toMatchObject({ carbsG: 360, kcal: 2640 });
  });
  it("día sin sesión → regla del día de la semana", async () => {
    const d = (await view.nutritionDayView(userId, "2026-11-17")).day;
    expect(d.target).toMatchObject({ source: "weekday", label: "Objetivo del martes" });
    expect(d.goal?.kcal).toBe(2200);
  });
  it("competición → tirada/competición", async () => {
    const d = (await view.nutritionDayView(userId, "2026-11-18")).day;
    expect(d.target).toMatchObject({ source: "session", kind: "long" });
    expect(d.goal?.carbsG).toBe(450);
  });
  it("sin reglas aplicables → respaldo a NutritionGoal", async () => {
    const d = (await view.nutritionDayView(userId, "2026-11-19")).day;
    expect(d.target.source).toBe("base");
    expect(d.goal).toMatchObject({ kcal: 2400, carbsG: 300 });
  });
  it("lo marcado a mano prevalece y se puede quitar; sin objetivo base también vale", async () => {
    await svc.setDayTarget(userId, "2026-11-16", { kcal: 1900, proteinG: 110, carbsG: 200, fatG: 60 });
    let d = (await view.nutritionDayView(userId, "2026-11-16")).day;
    expect(d.target.source).toBe("manual");
    expect(d.goal).toMatchObject({ kcal: 1900, carbsG: 200 });
    await svc.clearDayTarget(userId, "2026-11-16");
    d = (await view.nutritionDayView(userId, "2026-11-16")).day;
    expect(d.target.source).toBe("session");
    await svc.setDayTarget(noGoal, "2026-11-16", { kcal: 1500, proteinG: 90, carbsG: 150, fatG: 50 });
    expect((await view.nutritionDayView(noGoal, "2026-11-16")).day.goal?.kcal).toBe(1500);
    expect((await view.nutritionDayView(noGoal, "2026-11-17")).day.goal).toBeNull();
  });
  it("lo manual de una usuaria no afecta a otra", async () => {
    expect((await view.nutritionDayView(userId, "2026-11-19")).day.target.source).toBe("base");
  });
});
