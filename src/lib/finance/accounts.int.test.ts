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
    await prisma.subscription.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.trashItem.deleteMany({ where: { userId } });
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

  describe("archivar cuentas (C4)", () => {
    let arch: string;
    let live: string;
    const exp = (accountId: string) => fin.createTransaction(userId, { mode: "simple", kind: "EXPENSE", date: "2026-10-05", description: "Algo", amountCents: 100, moneyAccountId: accountId });

    beforeAll(async () => {
      arch = (await fin.createAccount(userId, { name: "Vieja", type: "ASSET", openingBalanceCents: 5000 })).id;
      live = (await fin.createAccount(userId, { name: "Activa", type: "ASSET", openingBalanceCents: 5000 })).id;
    });

    it("archivar y reactivar devuelve el saldo; las de contrapartida no se archivan; la ajena da 404", async () => {
      expect(await fin.setAccountArchived(userId, arch, true)).toMatchObject({ isArchived: true, balanceCents: 5000 });
      expect(await fin.setAccountArchived(userId, arch, false)).toMatchObject({ isArchived: false });
      const { expense } = await fin.ensureDefaultAccounts(userId);
      await expect(fin.setAccountArchived(userId, expense.id, true)).rejects.toMatchObject({ status: 409 });
      await expect(fin.setAccountArchived(otherId, arch, true)).rejects.toMatchObject({ status: 404 });
      await fin.setAccountArchived(userId, arch, true);
    });

    it("alta simple, transferencia y asiento partido sobre una archivada → 409 y no se escribe nada", async () => {
      const before = await prisma.financialTransaction.count({ where: { userId } });
      await expect(exp(arch)).rejects.toMatchObject({ status: 409 });
      await expect(fin.createTransaction(userId, { mode: "simple", kind: "TRANSFER", date: "2026-10-05", description: "T", amountCents: 100, moneyAccountId: live, counterAccountId: arch })).rejects.toMatchObject({ status: 409 });
      await expect(
        fin.createTransaction(userId, { mode: "split", kind: "TRANSFER", date: "2026-10-05", description: "S", postings: [{ accountId: arch, amountCents: 100 }, { accountId: live, amountCents: -100 }] }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await prisma.financialTransaction.count({ where: { userId } })).toBe(before);
      expect((await fin.listAccounts(userId)).find((a) => a.id === arch)?.balanceCents).toBe(5000);
    });

    it("editar, marcar como deportivo y categorizar un movimiento anterior de una archivada → 409", async () => {
      await fin.setAccountArchived(userId, arch, false);
      const t = await exp(arch);
      await fin.setAccountArchived(userId, arch, true);
      await expect(fin.updateTransaction(userId, t.id, { kind: "EXPENSE", date: "2026-10-05", description: "x", amountCents: 200, moneyAccountId: live })).rejects.toMatchObject({ status: 409 });
      const { categorizeTransaction } = await import("./category-rules-service");
      await fin.ensureBasicCategories(userId);
      const cat = await prisma.financialCategory.findFirstOrThrow({ where: { userId, kind: "EXPENSE" } });
      await expect(categorizeTransaction(userId, t.id, cat.id, false)).rejects.toMatchObject({ status: 409 });
      await fin.setAccountArchived(userId, arch, false);
    });

    it("importar un extracto a una archivada → 409 (vista previa e importación)", async () => {
      await fin.setAccountArchived(userId, arch, true);
      const bi = await import("./bank-import-service");
      const csv = "fecha;concepto;importe\n01/10/2026;Café;-1,50\n";
      const mapping = (await import("./bank-import")).bankMappingSchema.parse({ dateCol: 0, descCol: 1, amountCol: 2 });
      await expect(bi.previewStatement(userId, arch, csv, mapping)).rejects.toMatchObject({ status: 409 });
      await expect(bi.importStatement(userId, arch, csv, mapping)).rejects.toMatchObject({ status: 409 });
    });

    it("una suscripción vencida en una archivada se omite y conserva su fecha de cobro", async () => {
      await fin.setAccountArchived(userId, arch, true);
      const sub = await prisma.subscription.create({ data: { userId, name: "Gimnasio", amountCents: 3000, accountId: arch, autoPost: true, nextChargeDate: new Date("2026-01-01") } });
      const posted = await fin.runDueSubscriptions(userId);
      expect(posted.some((p) => p.subscriptionId === sub.id)).toBe(false);
      expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).nextChargeDate.toISOString().slice(0, 10)).toBe("2026-01-01");
    });

    it("restaurar de la papelera un movimiento de una archivada → 409; borrar sigue permitido", async () => {
      await fin.setAccountArchived(userId, arch, false);
      const t = await exp(arch);
      const trash = await import("@/lib/account/trash");
      const item = await trash.trashTransaction(userId, t.id);
      await fin.setAccountArchived(userId, arch, true);
      await expect(trash.restoreTrash(userId, item.id)).rejects.toMatchObject({ status: 409 });
      const t2 = await prisma.financialTransaction.findFirst({ where: { userId, postings: { some: { accountId: arch } }, kind: "EXPENSE" } });
      if (t2) await expect(trash.trashTransaction(userId, t2.id)).resolves.toBeDefined();
    });

    it("el saldo de una archivada sigue sumando y las activas funcionan igual", async () => {
      expect((await fin.listAccounts(userId)).find((a) => a.id === arch)?.isArchived).toBe(true);
      await expect(exp(live)).resolves.toBeDefined();
    });
  });
});
