// Integración con BD real (v1.7): plan de comidas → lista de la compra, sudoración, suplementos,
// tarjetas a mano y trabajos. Datos sintéticos.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("nutrición y estudio v1.7 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let userId: string;
  let other: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const t = Date.now();
    userId = (await prisma.user.create({ data: { email: `ns1-${t}@test.dev` } })).id;
    other = (await prisma.user.create({ data: { email: `ns2-${t}@test.dev` } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, other] } } });
  });

  it("plan semanal → lista de la compra sin duplicar; no se puede usar una receta ajena", async () => {
    const svc = await import("./v17-service");
    const mk = (u: string, name: string) =>
      prisma.recipe.create({ data: { userId: u, name, servings: 2, items: [{ name: "Lentejas", grams: 200, kcal100: 350, protein100: 24, carbs100: 60, fat100: 1 }, { name: "Zanahoria", grams: 100, kcal100: 40, protein100: 1, carbs100: 9, fat100: 0 }] } });
    const mine = await mk(userId, "Lentejas");
    const theirs = await mk(other, "Ajena");
    await svc.addMealPlanEntry(userId, { date: "2026-10-12", mealType: "LUNCH", recipeId: mine.id, servings: 2 });
    await svc.addMealPlanEntry(userId, { date: "2026-10-14", mealType: "DINNER", recipeId: mine.id, servings: 1 });
    await expect(svc.addMealPlanEntry(userId, { date: "2026-10-12", mealType: "LUNCH", recipeId: theirs.id, servings: 1 })).rejects.toThrow(/no encontrada/i);
    await prisma.shoppingItem.create({ data: { userId, name: "zanahoria" } });
    expect(await svc.shoppingFromWeek(userId, "2026-10-12")).toEqual({ added: 1 });
    expect(await prisma.shoppingItem.findMany({ where: { userId, name: "Lentejas" }, select: { qty: true } })).toEqual([{ qty: "300 g" }]);
    expect(await svc.shoppingFromWeek(userId, "2026-10-12")).toEqual({ added: 0 });
    const w = await svc.mealPlanWeek(userId, "2026-10-12");
    expect(w.entries).toHaveLength(2);
    expect(w.macros["2026-10-12"].kcal).toBe(2 * Math.round((700 + 40) / 2));
  });

  it("sudoración", async () => {
    const svc = await import("./v17-service");
    await svc.addSweatTest(userId, { date: "2026-10-10", minutes: 60, preKg: 70, postKg: 68.9, fluidMl: 500, urineMl: 100 });
    await expect(svc.addSweatTest(userId, { date: "2026-10-10", minutes: 60, preKg: 60, postKg: 65, fluidMl: 0, urineMl: 0 })).rejects.toThrow(/revisa/);
    expect((await svc.listSweatTests(userId))[0]).toMatchObject({ rateLh: 1.5, drinkMlPerH: 100 });
  });

  it("tarjetas a mano en el mismo SM-2 y trabajos con media", async () => {
    const st = await import("@/lib/study/v17-service");
    const r = await st.addManualCards(userId, "Biología", null, [{ front: "ADN", back: "Ácido desoxirribonucleico" }, { front: "ARN", back: "Ácido ribonucleico" }]);
    await st.addManualCards(userId, "Biología", null, [{ front: "ATP", back: "Adenosín trifosfato" }]);
    expect(await prisma.flashcard.count({ where: { deckId: r.deckId } })).toBe(3);
    const { reviewFlashcard } = await import("@/lib/ai/flashcards");
    const card = await prisma.flashcard.findFirstOrThrow({ where: { deckId: r.deckId } });
    await reviewFlashcard(userId, card.id, 5);
    expect((await prisma.flashcard.findUniqueOrThrow({ where: { id: card.id } })).repetitions).toBe(1);

    const a = await st.createAssignment(userId, { subject: "Física", title: "Práctica 1", dueOn: "2026-10-11", status: "TODO", weightPct: 30 });
    await st.createAssignment(userId, { subject: "Física", title: "Práctica 2", dueOn: "2026-10-30", status: "TODO", weightPct: 20 });
    await expect(st.updateAssignment(other, a.id, { status: "DONE" })).rejects.toThrow(/no encontrado/i);
    let v = await st.assignmentsView(userId, "2026-10-10");
    expect(v.open[0].alert).toMatchObject({ level: "red", text: "En 1 d y sin empezar" });
    await st.updateAssignment(userId, a.id, { status: "DONE", grade: 8 });
    v = await st.assignmentsView(userId, "2026-10-10");
    expect(v.done).toHaveLength(1);
    expect(v.averages).toEqual([{ subject: "Física", average: 8, gradedPct: 30 }]);
  });
});
