// v3.2 · Bloque M: gasto adaptativo con BD real (comida + peso de 4 semanas → estimación y borrador).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("gasto energético adaptativo (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./expenditure-service");
  let dates: typeof import("@/lib/dates");
  let userId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./expenditure-service");
    dates = await import("@/lib/dates");
    userId = (await prisma.user.create({ data: { email: `gasto-${Date.now()}@test.dev`, name: "Gasto" } })).id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  });

  it("sin datos: calibrando, sin número ni borrador", async () => {
    const v = await svc.expenditureFor(userId);
    expect(v.estimate.status).toBe("calibrating");
    expect(v.draft).toBeNull();
  });

  it("4 semanas comiendo 2400 y bajando 0,2 kg/semana → ≈ 2620 kcal; hoy no cuenta", async () => {
    const t = dates.today();
    for (let i = 1; i <= 30; i++) {
      const date = dates.addDays(t, -i);
      await prisma.macros.create({ data: { userId, date, mealType: "LUNCH", customName: "Comida", quantityG: 500, kcal: 1400, proteinG: 60, carbsG: 180, fatG: 40 } });
      await prisma.macros.create({ data: { userId, date, mealType: "DINNER", customName: "Cena", quantityG: 400, kcal: 1000, proteinG: 50, carbsG: 120, fatG: 30 } });
      if (i % 3 === 0) await prisma.recoveryMetrics.create({ data: { userId, date, bodyWeightKg: 65 + (0.2 / 7) * i } });
    }
    // Hoy, a medio día: no entra en la ventana
    await prisma.macros.create({ data: { userId, date: t, mealType: "BREAKFAST", customName: "Desayuno", quantityG: 100, kcal: 300, proteinG: 10, carbsG: 40, fatG: 10 } });
    await prisma.nutritionGoal.create({ data: { userId, effectiveFrom: dates.addDays(t, -40), kcal: 2300, proteinG: 120, carbsG: 300, fatG: 65 } });

    const v = await svc.expenditureFor(userId);
    expect(v.estimate.status).toBe("ok");
    if (v.estimate.status !== "ok") return;
    expect(v.estimate.avgIntakeKcal).toBe(2400);
    expect(v.estimate.kcal).toBeGreaterThanOrEqual(2600);
    expect(v.estimate.kcal).toBeLessThanOrEqual(2640);
    expect(v.draft?.status).toBe("draft");
    if (v.draft?.status === "draft") {
      expect(v.draft.goal.kcal).toBe(2450); // 2300 + 150 (tope semanal), camino de ≈ 2620
      expect(v.draft.goal.proteinG).toBe(120);
    }
  });
});
