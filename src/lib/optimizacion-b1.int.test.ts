// Integración con BD real (Optimización B1): las consultas en lote devuelven lo mismo que las de una en una
// y siguen aisladas por persona (mazos compartidos, cuentas ajenas).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("optimización B1 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let me: string;
  let owner: string;
  let stranger: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    const t = Date.now();
    me = (await prisma.user.create({ data: { email: `ob1a-${t}@test.dev`, athleteProfile: { create: {} } } })).id;
    owner = (await prisma.user.create({ data: { email: `ob1b-${t}@test.dev` } })).id;
    stranger = (await prisma.user.create({ data: { email: `ob1c-${t}@test.dev` } })).id;
  });
  afterAll(async () => {
    const { purgeUser } = await import("@/lib/account/service");
    for (const id of [me, owner, stranger]) await purgeUser(id);
    process.env = saved;
  });

  it("dueCounts: sin repaso o vencido cuenta; futuro no; mazo ajeno sin compartir no", async () => {
    const { dueCounts } = await import("@/lib/ai/flashcards");
    const day = 86_400_000;
    const mkDeck = async (userId: string, name: string, cards: number) => {
      const d = await prisma.flashcardDeck.create({ data: { userId, name } });
      await prisma.flashcard.createMany({ data: Array.from({ length: cards }, (_, i) => ({ deckId: d.id, front: `f${i}`, back: `b${i}` })) });
      return { deck: d, cards: await prisma.flashcard.findMany({ where: { deckId: d.id }, orderBy: { front: "asc" } }) };
    };
    const own = await mkDeck(me, "Propio", 4);
    const shared = await mkDeck(owner, "Compartido", 3);
    const hidden = await mkDeck(owner, "Oculto", 2);
    await prisma.flashcardDeckShare.create({ data: { deckId: shared.deck.id, userId: me } });
    // propio: 1 vencida, 1 futura (ni cuenta), 2 sin repasar
    await prisma.flashcardReview.create({ data: { userId: me, cardId: own.cards[0].id, dueAt: new Date(Date.now() - day) } });
    await prisma.flashcardReview.create({ data: { userId: me, cardId: own.cards[1].id, dueAt: new Date(Date.now() + 3 * day) } });
    // compartido: el repaso de OTRA persona no cuenta para mí
    await prisma.flashcardReview.create({ data: { userId: owner, cardId: shared.cards[0].id, dueAt: new Date(Date.now() + 3 * day) } });

    const counts = await dueCounts(me);
    expect(counts.get(own.deck.id)).toBe(3);
    expect(counts.get(shared.deck.id)).toBe(3);
    expect(counts.has(hidden.deck.id)).toBe(false);
    expect((await dueCounts(stranger)).size).toBe(0);
  });

  it("budgetsStatus: gasto por ventana y subcategorías, sin mezclar con otra cuenta", async () => {
    const { budgetsStatus, createTransaction } = await import("@/lib/finance/service");
    const { toIsoDay, today } = await import("@/lib/dates");
    const bank = await prisma.financialAccount.create({ data: { userId: me, name: "Banco", type: "ASSET" } });
    const bankOther = await prisma.financialAccount.create({ data: { userId: stranger, name: "Banco", type: "ASSET" } });
    const food = await prisma.financialCategory.create({ data: { userId: me, name: "Comida", kind: "EXPENSE" } });
    const rest = await prisma.financialCategory.create({ data: { userId: me, name: "Restaurantes", kind: "EXPENSE", parentId: food.id } });
    const fun = await prisma.financialCategory.create({ data: { userId: me, name: "Ocio", kind: "EXPENSE" } });
    const otherCat = await prisma.financialCategory.create({ data: { userId: stranger, name: "Comida", kind: "EXPENSE" } });
    const day = toIsoDay(today());
    const spend = (userId: string, acc: string, cat: string, cents: number) =>
      createTransaction(userId, { mode: "simple", kind: "EXPENSE", date: day, description: "g", amountCents: cents, moneyAccountId: acc, categoryId: cat });
    await spend(me, bank.id, food.id, 1000);
    await spend(me, bank.id, rest.id, 2500); // subcategoría: cuenta en Comida
    await spend(me, bank.id, fun.id, 700);
    await spend(stranger, bankOther.id, otherCat.id, 99_999);
    const start = new Date(Date.UTC(2020, 0, 1));
    await prisma.budget.create({ data: { userId: me, categoryId: food.id, period: "MONTHLY", amountCents: 10_000, startDate: start } });
    await prisma.budget.create({ data: { userId: me, categoryId: food.id, period: "YEARLY", amountCents: 50_000, startDate: start } });
    await prisma.budget.create({ data: { userId: me, categoryId: fun.id, period: "MONTHLY", amountCents: 500, startDate: start } });

    const list = await budgetsStatus(me);
    const food_m = list.find((b) => b.category.id === food.id && b.period === "MONTHLY")!;
    const food_y = list.find((b) => b.category.id === food.id && b.period === "YEARLY")!;
    const fun_m = list.find((b) => b.category.id === fun.id)!;
    expect(list).toHaveLength(3);
    expect(food_m).toMatchObject({ spentCents: 3500, remainingCents: 6500 });
    expect(food_y.spentCents).toBe(3500);
    expect(fun_m).toMatchObject({ spentCents: 700, remainingCents: -200 });
    expect(await budgetsStatus(stranger)).toHaveLength(0);
  }, 30_000);
});
