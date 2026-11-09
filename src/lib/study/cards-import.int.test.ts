// Integración con BD real (v2.8 · N2): importar tarjetas a un mazo sin duplicar, con vista previa que no escribe.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("importar flashcards (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./coursework-service");
  let userId: string;
  let otherId: string;
  const cards = [
    { front: "RAID 1", back: "espejo" },
    { front: "RAID 5", back: "paridad" },
  ];

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./coursework-service");
    userId = (await prisma.user.create({ data: { email: `ci-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `ci2-${Date.now()}@test.dev` } })).id;
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("la vista previa no escribe ni crea el mazo", async () => {
    const p = await svc.importCards(userId, { deck: "Sistemas", subject: "Sistemas", cards, dryRun: true });
    expect(p).toMatchObject({ isNew: true, create: 2, duplicates: 0, added: 0 });
    expect(await prisma.flashcardDeck.count({ where: { userId } })).toBe(0);
  });

  it("crea, y una segunda vez omite las ya existentes y las repetidas del lote", async () => {
    const a = await svc.importCards(userId, { deck: "Sistemas", subject: "Sistemas", cards, dryRun: false });
    expect(a).toMatchObject({ create: 2, added: 2, duplicates: 0 });
    const b = await svc.importCards(userId, { deck: "Sistemas", subject: "Sistemas", cards: [...cards, { front: "¿raid 5?", back: "x" }, { front: "LVM", back: "vol" }, { front: "lvm", back: "otra" }], dryRun: false });
    expect(b).toMatchObject({ isNew: false, create: 1, added: 1, duplicates: 4 });
    expect(await prisma.flashcard.count({ where: { deck: { userId, name: "Sistemas" } } })).toBe(3);
  });

  it("todo duplicado: 0 nuevas y no toca nada", async () => {
    const c = await svc.importCards(userId, { deck: "Sistemas", subject: null, cards, dryRun: false });
    expect(c).toMatchObject({ create: 0, added: 0, duplicates: 2 });
    expect(await prisma.flashcard.count({ where: { deck: { userId } } })).toBe(3);
  });

  it("sin nuevas no crea un mazo vacío, y el mazo de otra usuaria es independiente", async () => {
    const r = await svc.importCards(userId, { deck: "Vacío", subject: null, cards: [], dryRun: false });
    expect(r.added).toBe(0);
    expect(await prisma.flashcardDeck.count({ where: { userId, name: "Vacío" } })).toBe(0);
    const o = await svc.importCards(otherId, { deck: "Sistemas", subject: null, cards, dryRun: false });
    expect(o).toMatchObject({ isNew: true, added: 2 });
  });
});
