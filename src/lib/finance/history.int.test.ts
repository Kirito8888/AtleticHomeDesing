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
    expect(await ids({ from: "2026-10-24", to: "2026-10-31" })).toEqual([c.id]);
    expect(await fin.listTransactions(otherId, {})).toEqual([]);
  });
});
