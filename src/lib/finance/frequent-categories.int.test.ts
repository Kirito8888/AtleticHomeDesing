// Integración con BD real: categorías frecuentes (N10): ventana de 90 días, tipo y aislamiento por usuario.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("categorías frecuentes (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let fin: typeof import("./service");
  let userId: string;
  let otherId: string;
  let bank: string;
  let cat: Record<string, string>;

  const tx = (kind: "EXPENSE" | "INCOME", categoryId: string, date: string) =>
    fin.createTransaction(userId, { mode: "simple", kind, date, description: "x", amountCents: 100, moneyAccountId: bank, categoryId });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    fin = await import("./service");
    userId = (await prisma.user.create({ data: { email: `freq-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `freq2-${Date.now()}@test.dev` } })).id;
    bank = (await fin.createAccount(userId, { name: "Banco", type: "ASSET", openingBalanceCents: 10000 })).id;
    const mk = async (u: string, name: string, kind: "EXPENSE" | "INCOME") => (await prisma.financialCategory.create({ data: { userId: u, name, kind } })).id;
    cat = {
      comida: await mk(userId, "Comida", "EXPENSE"),
      viejo: await mk(userId, "Viejo", "EXPENSE"),
      beca: await mk(userId, "Beca", "INCOME"),
    };
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("cuenta solo los últimos 90 días y separa gasto de ingreso", async () => {
    await tx("EXPENSE", cat.comida, "2026-10-01");
    await tx("EXPENSE", cat.comida, "2026-10-20");
    await tx("EXPENSE", cat.viejo, "2026-06-01"); // fuera de ventana
    await tx("INCOME", cat.beca, "2026-11-01");
    const r = await fin.frequentCategories(userId, "2026-11-12");
    expect(r.EXPENSE).toEqual([cat.comida]);
    expect(r.INCOME).toEqual([cat.beca]);
  });

  it("otro usuario no ve nada", async () => {
    expect(await fin.frequentCategories(otherId, "2026-11-12")).toEqual({ EXPENSE: [], INCOME: [] });
  });
});
