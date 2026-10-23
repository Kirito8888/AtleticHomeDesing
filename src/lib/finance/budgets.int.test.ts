// Integración con BD real: presupuestos mensuales versionados, gasto con subcategorías y aislamiento por usuaria.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("presupuestos mensuales (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let fin: typeof import("./service");
  let bud: typeof import("./budgets-service");
  let userId: string;
  let otherId: string;
  let bank: string;
  let food: string;
  let veg: string;
  let salary: string;

  const spend = (amountCents: number, date: string, categoryId: string) =>
    fin.createTransaction(userId, { mode: "simple", kind: "EXPENSE", date, description: "Gasto", amountCents, moneyAccountId: bank, categoryId });
  const item = async (month: string, categoryId = food) => (await bud.monthlyBudgetView(userId, month)).items.find((i) => i.categoryId === categoryId);

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    fin = await import("./service");
    bud = await import("./budgets-service");
    userId = (await prisma.user.create({ data: { email: `bud-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `bud2-${Date.now()}@test.dev` } })).id;
    bank = (await fin.createAccount(userId, { name: "Banco", type: "ASSET", openingBalanceCents: 100000 })).id;
    food = (await prisma.financialCategory.create({ data: { userId, name: "Comida", kind: "EXPENSE" } })).id;
    veg = (await prisma.financialCategory.create({ data: { userId, name: "Verdura", kind: "EXPENSE", parentId: food } })).id;
    salary = (await prisma.financialCategory.create({ data: { userId, name: "Nómina", kind: "INCOME" } })).id;
    await spend(16000, "2026-10-05", food);
    await spend(6000, "2026-10-20", veg);
    await spend(5000, "2026-09-10", food);
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("cuenta el gasto de las subcategorías y marca el exceso", async () => {
    await bud.setMonthlyBudget(userId, { categoryId: food, amountCents: 20000, alertThresholdPct: 80, month: "2026-10" });
    expect(await item("2026-10")).toMatchObject({ spentCents: 22000, pct: 110, state: "EXCEEDED", overCents: 2000 });
  });

  it("editar desde noviembre no cambia octubre", async () => {
    await bud.setMonthlyBudget(userId, { categoryId: food, amountCents: 30000, alertThresholdPct: 80, month: "2026-11" });
    expect((await item("2026-10"))?.budgetCents).toBe(20000);
    expect((await item("2026-11"))?.budgetCents).toBe(30000);
    expect(await item("2026-09")).toBeUndefined();
  });

  it("editar dentro del mismo mes reemplaza sin duplicar", async () => {
    await bud.setMonthlyBudget(userId, { categoryId: food, amountCents: 25000, alertThresholdPct: 90, month: "2026-11" });
    const v = await bud.monthlyBudgetView(userId, "2026-11");
    expect(v.items.filter((i) => i.categoryId === food)).toHaveLength(1);
    expect(v.items[0]).toMatchObject({ budgetCents: 25000, alertThresholdPct: 90 });
  });

  it("quitar desde noviembre conserva octubre", async () => {
    await bud.deleteMonthlyBudget(userId, (await item("2026-11"))!.id, "2026-11");
    expect(await item("2026-11")).toBeUndefined();
    expect((await item("2026-10"))?.budgetCents).toBe(20000);
  });

  it("el reparto agrupa por categoría raíz y lista el gasto sin presupuesto", async () => {
    const v = await bud.monthlyBudgetView(userId, "2026-09");
    expect(v.slices).toEqual([{ key: food, name: "Comida", cents: 5000, pct: 100 }]);
    expect(v.unbudgeted).toEqual([{ categoryId: food, name: "Comida", spentCents: 5000 }]);
  });

  it("rechaza categorías de ingreso y ajenas; otra persona no ve ni borra", async () => {
    await expect(bud.setMonthlyBudget(userId, { categoryId: salary, amountCents: 100, alertThresholdPct: 80, month: "2026-10" })).rejects.toMatchObject({ status: 400 });
    await expect(bud.setMonthlyBudget(otherId, { categoryId: food, amountCents: 100, alertThresholdPct: 80, month: "2026-10" })).rejects.toMatchObject({ status: 404 });
    const id = (await item("2026-10"))!.id;
    await expect(bud.deleteMonthlyBudget(otherId, id, "2026-10")).rejects.toBeDefined();
    const v = await bud.monthlyBudgetView(otherId, "2026-10");
    expect(v.items).toEqual([]);
    expect(v.totalSpentCents).toBe(0);
    expect(await item("2026-10")).toBeDefined();
  });
});
