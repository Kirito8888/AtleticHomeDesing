// Integración con BD real: alimentos recientes/habituales (aislamiento por usuaria, ventana de 30 días, exclusiones). Datos sintéticos.
import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("alimentos recientes (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./recent-foods");
  let dates: typeof import("@/lib/dates");
  let userId: string;
  let other: string;
  const productIds: string[] = [];

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./recent-foods");
    dates = await import("@/lib/dates");
    const t = `${testStamp()}-${randomBytes(3).toString("hex")}`;
    userId = (await prisma.user.create({ data: { email: `rf1-${t}@test.dev` } })).id;
    other = (await prisma.user.create({ data: { email: `rf2-${t}@test.dev` } })).id;
    const mk = async (name: string, extra: Record<string, unknown> = {}) => {
      const p = await prisma.foodProduct.create({ data: { name: `${name}-${t}`, source: "own", kcalPer100g: 100, ...extra } });
      productIds.push(p.id);
      return p;
    };
    const ok = await mk("Yogur");
    const noKcal = await mk("SinDatos", { kcalPer100g: null });
    const foreign = await mk("Ajeno", { ownerId: other });
    const day = (back: number) => dates.dateOnly(dates.toIsoDay(dates.addDays(dates.today(), -back)));
    const e = (date: Date, who: string, productId: string | null, quantityG: number, customName?: string) => ({
      userId: who, date, mealType: "BREAKFAST" as const, foodProductId: productId, customName: customName ?? null, quantityG, kcal: quantityG, proteinG: 1, carbsG: 1, fatG: 1,
    });
    await prisma.macros.createMany({
      data: [
        e(day(1), userId, ok.id, 125),
        e(day(2), userId, ok.id, 125),
        e(day(3), userId, ok.id, 200),
        e(day(1), userId, null, 80, "Tostada"),
        e(day(45), userId, null, 50, "Antiguo"), // fuera de ventana
        e(day(-3), userId, null, 50, "Futuro"), // fecha futura
        e(day(1), userId, noKcal.id, 100),
        e(day(1), userId, foreign.id, 100),
        e(day(1), other, null, 60, "Solo de la otra"),
      ],
    });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, other] } } });
    await prisma.foodProduct.deleteMany({ where: { id: { in: productIds } } });
  });

  it("devuelve solo lo propio, dentro de 30 días y sin productos inutilizables", async () => {
    const r = await svc.recentFoods(userId);
    expect(r.map((f) => f.name.replace(/-.*$/, "")).sort()).toEqual(["Tostada", "Yogur"]);
    const y = r.find((f) => f.name.startsWith("Yogur"))!;
    expect(y).toMatchObject({ count: 3, usualG: 125 });
    expect(r[0]!.name.startsWith("Yogur")).toBe(true);
  });

  it("aísla por usuaria y respeta el límite", async () => {
    expect((await svc.recentFoods(other)).map((f) => f.name)).toEqual(["Solo de la otra"]);
    expect(await svc.recentFoods(userId, { limit: 1 })).toHaveLength(1);
  });
});
