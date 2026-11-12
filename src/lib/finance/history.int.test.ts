// Integración con BD real: edición y borrado de movimientos recalculan saldos; filtros del historial y aislamiento por usuario.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("historial: edición, borrado y filtros (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let fin: typeof import("./service");
  let trash: typeof import("@/lib/account/trash");
  let userId: string;
  let otherId: string;
  let bank: string;
  let cash: string;

  const balance = async (id: string) => (await fin.listAccounts(userId)).find((a) => a.id === id)?.balanceCents;
  const exp = (accountId: string, amountCents: number, date = "2026-10-02", description = "Súper") =>
    fin.createTransaction(userId, { mode: "simple", kind: "EXPENSE", date, description, amountCents, moneyAccountId: accountId });
  const edit = (id: string, over: Partial<Parameters<typeof fin.updateTransaction>[2]>) =>
    fin.updateTransaction(userId, id, { kind: "EXPENSE", date: "2026-10-02", description: "Súper", amountCents: 2000, moneyAccountId: bank, ...over });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    fin = await import("./service");
    trash = await import("@/lib/account/trash");
    userId = (await prisma.user.create({ data: { email: `hist-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `hist2-${Date.now()}@test.dev` } })).id;
    bank = (await fin.createAccount(userId, { name: "Banco", type: "ASSET", openingBalanceCents: 10000 })).id;
    cash = (await fin.createAccount(userId, { name: "Efectivo", type: "ASSET" })).id;
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.trashItem.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("borrar un gasto de 30 € restaura 30 € al saldo", async () => {
    const t = await exp(bank, 3000);
    expect(await balance(bank)).toBe(7000);
    await trash.trashTransaction(userId, t.id);
    expect(await balance(bank)).toBe(10000);
  });

  it("editar de 20 € a 50 € descuenta 30 € adicionales", async () => {
    const t = await exp(bank, 2000);
    expect(await balance(bank)).toBe(8000);
    await edit(t.id, { amountCents: 5000 });
    expect(await balance(bank)).toBe(5000);
    await trash.trashTransaction(userId, t.id);
    expect(await balance(bank)).toBe(10000);
  });

  it("cambiar de cuenta y de tipo recalcula las cuentas implicadas y el consolidado", async () => {
    const t = await exp(bank, 2000);
    const net = async () => (await fin.listAccounts(userId)).filter((a) => a.type === "ASSET").reduce((s, a) => s + a.balanceCents, 0);
    expect(await net()).toBe(8000);
    await edit(t.id, { moneyAccountId: cash });
    expect(await balance(bank)).toBe(10000);
    expect(await balance(cash)).toBe(-2000);
    expect(await net()).toBe(8000);
    await edit(t.id, { kind: "INCOME", moneyAccountId: cash });
    expect(await balance(cash)).toBe(2000);
    await trash.trashTransaction(userId, t.id);
    expect(await balance(cash)).toBe(0);
  });

  it("otra persona no puede editar el movimiento ni cargar su cuenta; transferencias y aperturas no se editan", async () => {
    const t = await exp(bank, 1000);
    await expect(fin.updateTransaction(otherId, t.id, { kind: "EXPENSE", date: "2026-10-02", description: "x", amountCents: 1, moneyAccountId: bank })).rejects.toMatchObject({ status: 404 });
    await expect(edit(t.id, { moneyAccountId: (await prisma.financialAccount.create({ data: { userId: otherId, name: "Ajena", type: "ASSET" } })).id })).rejects.toMatchObject({ status: 400 });
    const opening = await prisma.financialTransaction.findFirstOrThrow({ where: { userId, kind: "OPENING_BALANCE" } });
    await expect(edit(opening.id, {})).rejects.toMatchObject({ status: 409 });
    await trash.trashTransaction(userId, t.id);
  });

  it("filtros por cuenta, tipo y rango; más recientes primero; aislado por usuario", async () => {
    const a = await exp(bank, 100, "2026-09-10", "Septiembre");
    const b = await exp(cash, 200, "2026-10-20", "Octubre efectivo");
    const c = await fin.createTransaction(userId, { mode: "simple", kind: "INCOME", date: "2026-10-25", description: "Beca", amountCents: 500, moneyAccountId: bank });
    const ids = async (f: Parameters<typeof fin.listTransactions>[1]) => (await fin.listTransactions(userId, f)).map((t) => t.id);
    expect(await ids({ kind: "EXPENSE" })).toEqual([b.id, a.id]);
    expect(await ids({ kind: "INCOME" })).toEqual([c.id]);
    expect(await ids({ accountId: cash })).toEqual([b.id]);
    expect(await ids({ from: "2026-10-01", to: "2026-10-31", accountId: bank })).not.toContain(a.id);
    // el asiento de apertura de la cuenta lleva la fecha de hoy: el rango se acota por tipo para no depender del día
    expect(await ids({ from: "2026-10-24", to: "2026-10-31", kind: "INCOME" })).toEqual([c.id]);
    expect(await fin.listTransactions(otherId, {})).toEqual([]);
  });

  describe("transferencias y asientos partidos (N6)", () => {
    let card: string;
    const tr = (from: string, to: string, amountCents: number) =>
      fin.createTransaction(userId, { mode: "simple", kind: "TRANSFER", date: "2026-10-06", description: "Traspaso", amountCents, moneyAccountId: from, counterAccountId: to });
    const lines = (t: { postings: Array<{ id: string; accountId: string; amountCents: number; categoryId: string | null; memo: string | null }> }) =>
      t.postings.map((p) => ({ id: p.id, accountId: p.accountId, amountCents: p.amountCents, categoryId: p.categoryId, memo: p.memo }));
    const editLines = (id: string, l: ReturnType<typeof lines>, over: Record<string, unknown> = {}) =>
      fin.updateTransaction(userId, id, { mode: "lines", date: "2026-10-06", description: "Traspaso", lines: l, ...over } as Parameters<typeof fin.updateTransaction>[2]);

    beforeAll(async () => {
      card = (await fin.createAccount(userId, { name: "Tarjeta T", type: "LIABILITY" })).id;
    });

    it("editar importe y cuenta destino de una transferencia recalcula saldos y conserva los ids", async () => {
      const b0 = (await balance(bank))!;
      const c0 = (await balance(cash))!;
      const k0 = (await balance(card))!;
      const t = await tr(bank, cash, 2000);
      expect(await balance(bank)).toBe(b0 - 2000);
      const l = lines(t);
      const ids = l.map((x) => x.id).sort();
      const out = l.find((x) => x.amountCents < 0)!;
      const inn = l.find((x) => x.amountCents > 0)!;
      const edited = await editLines(t.id, [{ ...out, amountCents: -3500 }, { ...inn, accountId: card, amountCents: 3500 }], { description: "Pago tarjeta" });
      expect(edited.postings.map((p) => p.id).sort()).toEqual(ids);
      expect(await balance(bank)).toBe(b0 - 3500);
      expect(await balance(cash)).toBe(c0);
      expect(await balance(card)).toBe(k0 + 3500);
      const total = (await fin.listAccounts(userId)).filter((a) => ["ASSET", "LIABILITY"].includes(a.type)).reduce((s, a) => s + a.balanceCents, 0);
      expect(total).toBe(b0 + c0 + k0);
      await trash.trashTransaction(userId, t.id);
    });

    it("una transferencia no admite descuadre, líneas nuevas/quitadas ni cuentas que no son de dinero", async () => {
      const t = await tr(bank, cash, 1000);
      const before = await balance(bank);
      const [a, b] = lines(t);
      await expect(editLines(t.id, [{ ...a, amountCents: a.amountCents + 1 }, b])).rejects.toMatchObject({ status: 400 });
      await expect(editLines(t.id, [a])).rejects.toMatchObject({ status: 409 });
      await expect(editLines(t.id, [a, b, { ...b, id: "nueva", amountCents: 0 }])).rejects.toMatchObject({ status: 409 });
      await expect(editLines(t.id, [a, { ...b, id: "otra" }])).rejects.toMatchObject({ status: 409 });
      const { expense } = await fin.ensureDefaultAccounts(userId);
      await expect(editLines(t.id, [a, { ...b, accountId: expense.id }])).rejects.toMatchObject({ status: 400 });
      expect(await balance(bank)).toBe(before);
      await trash.trashTransaction(userId, t.id);
    });

    it("un asiento partido se edita (importes, categorías y notas) y sigue cuadrado", async () => {
      await fin.ensureBasicCategories(userId);
      const cat = await prisma.financialCategory.findFirstOrThrow({ where: { userId, kind: "EXPENSE" } });
      const { expense } = await fin.ensureDefaultAccounts(userId);
      const b0 = (await balance(bank))!;
      const t = await fin.createTransaction(userId, {
        mode: "split",
        kind: "EXPENSE",
        date: "2026-10-06",
        description: "Compra mixta",
        postings: [
          { accountId: expense.id, amountCents: 3000 },
          { accountId: expense.id, amountCents: 2000 },
          { accountId: bank, amountCents: -5000 },
        ],
      });
      const l = lines(t);
      const [e1, e2, pay] = [l.find((x) => x.amountCents === 3000)!, l.find((x) => x.amountCents === 2000)!, l.find((x) => x.amountCents === -5000)!];
      await expect(editLines(t.id, [e1, e2, { ...pay, amountCents: -5500 }])).rejects.toMatchObject({ status: 400 });
      const edited = await editLines(t.id, [{ ...e1, amountCents: 3500, categoryId: cat.id, memo: "pan" }, e2, { ...pay, amountCents: -5500 }]);
      expect(edited.postings.reduce((s, p) => s + p.amountCents, 0)).toBe(0);
      expect(edited.postings.find((p) => p.id === e1.id)).toMatchObject({ amountCents: 3500, categoryId: cat.id, memo: "pan" });
      expect(await balance(bank)).toBe(b0 - 5500);
      await trash.trashTransaction(userId, t.id);
    });

    it("la apertura sigue sin editarse, un simple no entra por líneas y otra persona recibe 404", async () => {
      const opening = await prisma.financialTransaction.findFirstOrThrow({ where: { userId, kind: "OPENING_BALANCE" }, include: { postings: true } });
      await expect(editLines(opening.id, lines(opening))).rejects.toMatchObject({ status: 409 });
      const simple = await exp(bank, 700);
      const sp = await prisma.posting.findMany({ where: { transactionId: simple.id } });
      await expect(editLines(simple.id, lines({ postings: sp }))).rejects.toMatchObject({ status: 409 });
      const t = await tr(bank, cash, 500);
      await expect(fin.updateTransaction(otherId, t.id, { mode: "lines", date: "2026-10-06", description: "x", lines: lines(t) })).rejects.toMatchObject({ status: 404 });
      await trash.trashTransaction(userId, t.id);
      await trash.trashTransaction(userId, simple.id);
    });

    it("no se mueve dinero hacia una cuenta archivada ni se edita un movimiento que la toca", async () => {
      const t = await tr(bank, cash, 800);
      const [a, b] = lines(t);
      const dest = b.amountCents > 0 ? b : a;
      await fin.setAccountArchived(userId, card, true);
      await expect(editLines(t.id, [a.amountCents < 0 ? a : b, { ...dest, accountId: card }])).rejects.toMatchObject({ status: 409 });
      await fin.setAccountArchived(userId, cash, true);
      await expect(editLines(t.id, [a, b])).rejects.toMatchObject({ status: 409 });
      await fin.setAccountArchived(userId, cash, false);
      await fin.setAccountArchived(userId, card, false);
      await trash.trashTransaction(userId, t.id);
    });
  });
});
