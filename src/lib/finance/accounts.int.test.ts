// Integración con BD real: cuenta con saldo inicial, ingreso y gasto, y aislamiento entre usuarios.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("cuentas y movimientos (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let fin: typeof import("./service");
  let userId: string;
  let otherId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    fin = await import("./service");
    userId = (await prisma.user.create({ data: { email: `acc-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `acc2-${Date.now()}@test.dev` } })).id;
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("100 € + ingreso 50 € − gasto 30 € = 120 € por cuenta", async () => {
    const acc = await fin.createAccount(userId, { name: "Cuenta corriente", type: "ASSET", openingBalanceCents: 10000 });
    await fin.createTransaction(userId, { mode: "simple", kind: "INCOME", date: "2026-10-01", description: "Beca", amountCents: 5000, moneyAccountId: acc.id });
    await fin.createTransaction(userId, { mode: "simple", kind: "EXPENSE", date: "2026-10-02", description: "Súper", amountCents: 3000, moneyAccountId: acc.id });
    const mine = (await fin.listAccounts(userId)).find((a) => a.id === acc.id);
    expect(mine?.balanceCents).toBe(12000);
  });

  it("con dos cuentas, ingreso y gasto afectan solo a la elegida (corriente y tarjeta)", async () => {
    const bank = await fin.createAccount(userId, { name: "Banco B", type: "ASSET", openingBalanceCents: 20000 });
    const card = await fin.createAccount(userId, { name: "Tarjeta B", type: "LIABILITY" });
    const tx = await fin.createTransaction(userId, { mode: "simple", kind: "INCOME", date: "2026-10-03", description: "Premio", amountCents: 5000, moneyAccountId: card.id });
    expect(tx.postings.some((p) => p.accountId === card.id)).toBe(true);
    await fin.createTransaction(userId, { mode: "simple", kind: "EXPENSE", date: "2026-10-04", description: "Material", amountCents: 1200, moneyAccountId: bank.id });
    const list = await fin.listAccounts(userId);
    expect(list.find((a) => a.id === bank.id)?.balanceCents).toBe(18800);
    expect(list.find((a) => a.id === card.id)?.balanceCents).toBe(5000);
  });

  it("sin saldo inicial la cuenta empieza en 0", async () => {
    const acc = await fin.createAccount(userId, { name: "Efectivo", type: "ASSET" });
    expect((await fin.listAccounts(userId)).find((a) => a.id === acc.id)?.balanceCents).toBe(0);
  });

  it("otra persona no ve la cuenta ni puede apuntar en ella", async () => {
    const acc = await fin.createAccount(userId, { name: "Privada", type: "ASSET", openingBalanceCents: 1000 });
    expect((await fin.listAccounts(otherId)).some((a) => a.id === acc.id)).toBe(false);
    await expect(
      fin.createTransaction(otherId, { mode: "simple", kind: "EXPENSE", date: "2026-10-02", description: "Intruso", amountCents: 100, moneyAccountId: acc.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("categorías básicas: se crean una vez y no pisan las propias", async () => {
    await fin.ensureBasicCategories(userId);
    await fin.ensureBasicCategories(userId);
    expect(await prisma.financialCategory.count({ where: { userId } })).toBe(9);
    await prisma.financialCategory.create({ data: { userId: otherId, name: "Mi categoría", kind: "EXPENSE" } });
    await fin.ensureBasicCategories(otherId);
    expect(await prisma.financialCategory.count({ where: { userId: otherId } })).toBe(1);
  });
});
