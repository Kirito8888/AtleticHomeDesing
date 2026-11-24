// v3.2 K (V3-N03) · tope diario de repasos: cuenta las tarjetas del día de Madrid y recorta la cola.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe("remainingToday (puro)", async () => {
  const { remainingToday } = await import("./flashcards");
  it("0 = sin tope; nunca negativo", () => {
    expect(remainingToday(0, 999)).toBeNull();
    expect(remainingToday(20, 5)).toBe(15);
    expect(remainingToday(20, 25)).toBe(0);
  });
});

describe.skipIf(!HAS_DB)("tope diario de flashcards (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./flashcards");
  let userId: string;
  let cardIds: string[];

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./flashcards");
    userId = (await prisma.user.create({ data: { email: `fc-cap-${Date.now()}@test.dev`, name: "cap" } })).id;
    const st = await import("@/lib/study/coursework-service");
    const r = await st.addManualCards(userId, "Tope", null, ["A", "B", "C", "D"].map((f) => ({ front: f, back: f.toLowerCase() })));
    cardIds = (await prisma.flashcard.findMany({ where: { deckId: r.deckId }, orderBy: { front: "asc" }, select: { id: true } })).map((c) => c.id);
  });
  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("cuenta solo las repasadas hoy y aplica el tope de prefs", async () => {
    await svc.reviewFlashcard(userId, cardIds[0], 4);
    await svc.reviewFlashcard(userId, cardIds[1], 4);
    // Una de ayer no cuenta
    await prisma.flashcardReview.create({ data: { userId, cardId: cardIds[2], lastReviewedAt: new Date(Date.now() - 2 * 86400_000), dueAt: new Date(Date.now() - 86400_000) } });
    expect(await svc.reviewedToday(userId)).toBe(2);

    expect((await svc.dailyCap(userId)).remaining).toBeNull();
    const { updatePrefs } = await import("@/lib/rules/prefs-service");
    await updatePrefs(userId, { flashcardDailyCap: 3 });
    expect(await svc.dailyCap(userId)).toMatchObject({ cap: 3, reviewed: 2, remaining: 1 });
  });
});
