// Integración con BD real: plantillas de comidas habituales (guardar una toma, sustituir, cargar en su toma o en otra).
// Datos sintéticos.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("plantillas de comidas (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./meal-templates");
  let userId: string;
  let other: string;
  const DAY = "2026-10-12";
  const NEXT = "2026-10-13";

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./meal-templates");
    const t = testStamp();
    userId = (await prisma.user.create({ data: { email: `mt1-${t}@test.dev` } })).id;
    other = (await prisma.user.create({ data: { email: `mt2-${t}@test.dev` } })).id;
    const food = (customName: string, quantityG: number, kcal: number) => ({
      userId,
      date: new Date(`${DAY}T00:00:00Z`),
      mealType: "BREAKFAST" as const,
      customName,
      quantityG,
      kcal,
      proteinG: 10,
      carbsG: 40,
      fatG: 5,
    });
    await prisma.macros.createMany({ data: [food("Avena", 60, 230), food("Leche", 250, 120)] });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, other] } } });
  });

  it("guarda los alimentos y cantidades de una toma y la lista con kcal y nombres", async () => {
    const tpl = await svc.saveMealTemplate(userId, "Desayuno habitual", DAY, "BREAKFAST");
    expect(tpl).toMatchObject({ name: "Desayuno habitual", mealType: "BREAKFAST", _count: { items: 2 } });
    const list = await svc.listMealTemplates(userId);
    expect(list).toEqual([{ id: tpl.id, name: "Desayuno habitual", mealType: "BREAKFAST", items: 2, kcal: 350, foods: ["Avena", "Leche"] }]);
    expect(await svc.listMealTemplates(other)).toEqual([]);
  });

  it("el mismo nombre sustituye la plantilla en vez de duplicarla", async () => {
    await svc.saveMealTemplate(userId, "Desayuno habitual", DAY, "BREAKFAST");
    expect(await prisma.mealTemplate.count({ where: { userId } })).toBe(1);
    expect(await prisma.mealTemplateItem.count({ where: { template: { userId } } })).toBe(2);
  });

  it("una toma vacía no se puede guardar", async () => {
    await expect(svc.saveMealTemplate(userId, "Cena", DAY, "DINNER")).rejects.toMatchObject({ status: 404 });
  });

  it("cargar sin toma la vuelca en la suya; con toma, en la indicada; mismas cantidades y macros", async () => {
    const [tpl] = await svc.listMealTemplates(userId);
    expect(await svc.applyMealTemplate(userId, tpl.id, NEXT)).toEqual({ added: 2, mealType: "BREAKFAST" });
    expect(await svc.applyMealTemplate(userId, tpl.id, NEXT, "SNACK")).toEqual({ added: 2, mealType: "SNACK" });
    const rows = await prisma.macros.findMany({
      where: { userId, date: new Date(`${NEXT}T00:00:00Z`) },
      orderBy: [{ mealType: "asc" }, { createdAt: "asc" }],
      select: { mealType: true, customName: true, quantityG: true, kcal: true },
    });
    expect(rows).toEqual([
      { mealType: "BREAKFAST", customName: "Avena", quantityG: 60, kcal: 230 },
      { mealType: "BREAKFAST", customName: "Leche", quantityG: 250, kcal: 120 },
      { mealType: "SNACK", customName: "Avena", quantityG: 60, kcal: 230 },
      { mealType: "SNACK", customName: "Leche", quantityG: 250, kcal: 120 },
    ]);
  });

  it("un menú cargado en un día y una toma vacíos deja los mismos totales que el original; cargarlo dos veces duplica", async () => {
    const [tpl] = await svc.listMealTemplates(userId);
    const FAR = "2026-10-20";
    const sum = (day: string) =>
      prisma.macros.aggregate({ where: { userId, date: new Date(`${day}T00:00:00Z`) }, _sum: { kcal: true, proteinG: true, carbsG: true, fatG: true } });
    await svc.applyMealTemplate(userId, tpl.id, FAR, "DINNER");
    expect((await sum(FAR))._sum).toEqual((await sum(DAY))._sum);
    await svc.applyMealTemplate(userId, tpl.id, FAR, "DINNER");
    expect((await sum(FAR))._sum.kcal).toBe(700);
  });

  it("no se puede cargar la plantilla de otra usuaria", async () => {
    const [tpl] = await svc.listMealTemplates(userId);
    await expect(svc.applyMealTemplate(other, tpl.id, NEXT)).rejects.toMatchObject({ status: 404 });
    expect(await prisma.macros.count({ where: { userId: other } })).toBe(0);
  });

  it("tope de 50 plantillas (sustituir una existente sigue permitido)", async () => {
    await prisma.mealTemplate.createMany({ data: Array.from({ length: 49 }, (_, i) => ({ userId, name: `Relleno ${i}` })) });
    await expect(svc.saveMealTemplate(userId, "Una más", DAY, "BREAKFAST")).rejects.toMatchObject({ status: 400 });
    await expect(svc.saveMealTemplate(userId, "Desayuno habitual", DAY, "BREAKFAST")).resolves.toMatchObject({ name: "Desayuno habitual" });
  });
});
