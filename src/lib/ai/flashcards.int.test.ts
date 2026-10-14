// Integración con BD real (v2.0 C): mazos compartidos en solo lectura, SM-2 por persona y migración de datos.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const MIG = "prisma/migrations/20270101080000_v2_0_features/migration.sql";
const DATA = "prisma/data-migrations/20270101080000_v2_0_features.sql";

describe.skipIf(!HAS_DB)("flashcards compartidas v2.0 C (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./flashcards");
  let owner: string;
  let reader: string;
  let stranger: string;
  let deckId: string;
  let cardIds: string[];

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./flashcards");
    const t = Date.now();
    const mk = async (k: string) => (await prisma.user.create({ data: { email: `fc-${k}-${t}@test.dev`, name: k } })).id;
    [owner, reader, stranger] = [await mk("owner"), await mk("reader"), await mk("stranger")];
    const st = await import("@/lib/study/coursework-service");
    const r = await st.addManualCards(owner, "Anatomía", null, [
      { front: "Fémur", back: "Hueso del muslo" },
      { front: "Tibia", back: "Hueso de la pierna" },
      { front: "Húmero", back: "Hueso del brazo" },
    ]);
    deckId = r.deckId;
    cardIds = (await prisma.flashcard.findMany({ where: { deckId }, orderBy: { front: "asc" }, select: { id: true } })).map((c) => c.id);
    await svc.shareDeck(owner, deckId, `FC-reader-${t}@test.dev`);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner, reader, stranger] } } });
  });

  it("la lectora ve el mazo y el SM-2 es independiente del de la dueña", async () => {
    expect((await svc.listDecks(reader)).find((d) => d.id === deckId)).toMatchObject({ shared: true, total: 3, due: 3, reviewed: 0 });
    const before = await prisma.flashcard.findMany({ where: { deckId }, orderBy: { id: "asc" } });

    await svc.reviewFlashcard(reader, cardIds[0], 5);
    await svc.reviewFlashcard(reader, cardIds[0], 5);
    await svc.reviewFlashcard(owner, cardIds[0], 1);

    const rr = await prisma.flashcardReview.findUniqueOrThrow({ where: { userId_cardId: { userId: reader, cardId: cardIds[0] } } });
    const ro = await prisma.flashcardReview.findUniqueOrThrow({ where: { userId_cardId: { userId: owner, cardId: cardIds[0] } } });
    expect(rr).toMatchObject({ repetitions: 2, intervalDays: 6, lastGrade: 5 });
    expect(ro).toMatchObject({ repetitions: 0, intervalDays: 1, lastGrade: 1 });
    expect(rr.lastReviewedAt).toBeTruthy();
    // El contenido y el estado heredado de Flashcard no se tocan
    expect(await prisma.flashcard.findMany({ where: { deckId }, orderBy: { id: "asc" } })).toEqual(before);

    expect((await svc.dueCards(reader, { deckId, limit: 10 })).map((c) => c.id).sort()).toEqual([cardIds[1], cardIds[2]].sort());
    expect((await svc.listDecks(reader)).find((d) => d.id === deckId)).toMatchObject({ due: 2, reviewed: 1 });
    expect((await svc.listDecks(owner)).find((d) => d.id === deckId)).toMatchObject({ shared: false, sharedWith: 1, due: 2 });
  });

  it("una invitada no puede editar ni borrar tarjetas ni el mazo (403); una ajena ni lo ve (404)", async () => {
    await expect(svc.updateCard(reader, cardIds[1], { front: "Hackeada" })).rejects.toMatchObject({ status: 403 });
    await expect(svc.deleteCard(reader, cardIds[1])).rejects.toMatchObject({ status: 403 });
    await expect(svc.deleteDeck(reader, deckId)).rejects.toMatchObject({ status: 403 });
    await expect(svc.shareDeck(reader, deckId, "otra@test.dev")).rejects.toMatchObject({ status: 403 });
    await expect(svc.listShares(reader, deckId)).rejects.toMatchObject({ status: 403 });
    await expect(svc.unshareDeck(reader, deckId, owner)).rejects.toMatchObject({ status: 403 });

    await expect(svc.updateCard(stranger, cardIds[1], { front: "Hackeada" })).rejects.toMatchObject({ status: 404 });
    await expect(svc.deleteCard(stranger, cardIds[1])).rejects.toMatchObject({ status: 404 });
    await expect(svc.deleteDeck(stranger, deckId)).rejects.toMatchObject({ status: 404 });
    await expect(svc.reviewFlashcard(stranger, cardIds[1], 4)).rejects.toMatchObject({ status: 404 });
    expect(await svc.listDecks(stranger)).toEqual([]);
    expect(await svc.dueCards(stranger, { limit: 10 })).toEqual([]);

    expect(await prisma.flashcard.count({ where: { deckId } })).toBe(3);
    expect((await prisma.flashcard.findUniqueOrThrow({ where: { id: cardIds[1] } })).front).not.toBe("Hackeada");
  });

  it("compartir no revela qué emails existen y no cabe compartir contigo misma", async () => {
    await expect(svc.shareDeck(owner, deckId, "no-existe@test.dev")).rejects.toMatchObject({ status: 404, message: "No se pudo compartir el mazo" });
    const me = await prisma.user.findUniqueOrThrow({ where: { id: owner }, select: { email: true } });
    await expect(svc.shareDeck(owner, deckId, me.email)).rejects.toMatchObject({ status: 404, message: "No se pudo compartir el mazo" });
  });

  it("la dueña quita el acceso: la lectora pierde el mazo y su progreso; el de la dueña sigue", async () => {
    await svc.unshareDeck(owner, deckId, reader);
    await expect(svc.reviewFlashcard(reader, cardIds[1], 4)).rejects.toMatchObject({ status: 404 });
    expect(await svc.listDecks(reader)).toEqual([]);
    expect(await prisma.flashcardReview.count({ where: { userId: reader } })).toBe(0);
    expect(await prisma.flashcardReview.count({ where: { userId: owner } })).toBe(1);
    // Una lectora también puede dejar el mazo ella misma
    await svc.shareDeck(owner, deckId, (await prisma.user.findUniqueOrThrow({ where: { id: reader }, select: { email: true } })).email);
    await svc.unshareDeck(reader, deckId, reader);
    expect(await prisma.flashcardDeckShare.count({ where: { deckId } })).toBe(0);
    await expect(svc.unshareDeck(stranger, deckId, stranger)).rejects.toMatchObject({ status: 404 });
  });

  it("la dueña sí edita y borra; al borrar el mazo desaparecen sus reviews", async () => {
    await svc.updateCard(owner, cardIds[2], { back: "Hueso del brazo (proximal)" });
    await svc.deleteCard(owner, cardIds[2]);
    await svc.deleteDeck(owner, deckId);
    expect(await prisma.flashcardReview.count({ where: { cardId: { in: cardIds } } })).toBe(0);
  });

  it("migración de datos: el SM-2 de cada Flashcard pasa a la dueña del mazo, sin duplicar", async () => {
    const st = await import("@/lib/study/coursework-service");
    const r = await st.addManualCards(owner, "Migrada", null, [{ front: "Vieja uno", back: "a" }, { front: "Vieja dos", back: "b" }]);
    const [c1, c2] = await prisma.flashcard.findMany({ where: { deckId: r.deckId }, orderBy: { front: "asc" } });
    const due = new Date("2026-11-01T00:00:00Z");
    const last = new Date("2026-10-10T08:00:00Z");
    await prisma.flashcard.update({ where: { id: c1.id }, data: { easeFactor: 2.1, intervalDays: 15, repetitions: 4, dueAt: due, lastReviewedAt: last } });
    expect(await prisma.flashcardReview.count({ where: { cardId: { in: [c1.id, c2.id] } } })).toBe(0);

    const sql = readFileSync(DATA, "utf8");
    const url = process.env.DATABASE_URL!.split("?")[0];
    const run = () => execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-qc", sql], { stdio: "pipe" });
    run();
    run(); // idempotente

    const rows = await prisma.flashcardReview.findMany({ where: { cardId: { in: [c1.id, c2.id] } }, orderBy: { cardId: "asc" } });
    expect(rows).toHaveLength(2);
    const m1 = rows.find((x) => x.cardId === c1.id)!;
    expect(m1).toMatchObject({ userId: owner, easeFactor: 2.1, intervalDays: 15, repetitions: 4 });
    expect(m1.dueAt).toEqual(due);
    expect(m1.lastReviewedAt).toEqual(last);
    expect(rows.find((x) => x.cardId === c2.id)).toMatchObject({ userId: owner, easeFactor: 2.5, repetitions: 0 });
    // No se vuelca nada a otras personas y no hay reviews cruzadas
    expect(rows.every((x) => x.userId === owner)).toBe(true);
    // Un repaso posterior continúa desde el estado migrado (4 repeticiones, EF 2.1)
    const next = await svc.reviewFlashcard(owner, c1.id, 4);
    expect(next).toMatchObject({ repetitions: 5, intervalDays: Math.round(15 * 2.1) });
  });

  it("el SQL de datos viaja dentro de la migración (sobrevive a regen-mig)", () => {
    const mig = readFileSync(MIG, "utf8");
    expect(mig).toContain('CREATE TABLE "FlashcardReview"');
    expect(mig).toContain('CREATE TABLE "FlashcardDeckShare"');
    expect(mig).toContain(readFileSync(DATA, "utf8").trim());
    expect(mig).not.toMatch(/DROP (TABLE|COLUMN)/);
  });
});
