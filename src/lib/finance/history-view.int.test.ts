// @vitest-environment node
// Integración con BD real (v2.11 B3 · O16): las vistas que alimentan las zonas de Finanzas y Nutrición.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testStamp } from "@/test/stamp";

vi.mock("server-only", () => ({}));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const t = testStamp();

describe("parseHistoryParams", () => {
  it("valida filtros, expande el mes y acota el límite", async () => {
    const { parseHistoryParams } = await import("./history-view");
    expect(parseHistoryParams({ kind: "expense", month: "2026-02", limit: "5000" })).toEqual({ kind: "EXPENSE", month: "2026-02", from: "2026-02-01", to: "2026-02-28", limit: 1000 });
    expect(parseHistoryParams({ kind: "otro", month: "2026-13", from: "mal", limit: "x" })).toEqual({ kind: undefined, month: undefined, from: undefined, to: undefined, limit: 100 });
    expect(parseHistoryParams({ month: "2026-02", from: "2026-02-10" }).from).toBe("2026-02-10");
  });
});

describe.skipIf(!HAS_DB)("vistas de zona (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let userId: string;
  let otherId: string;
  let accId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const fin = await import("./service");
    userId = (await prisma.user.create({ data: { email: `zv-a-${t}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `zv-b-${t}@test.dev` } })).id;
    const acc = await fin.createAccount(userId, { name: "Cuenta zona", type: "ASSET", openingBalanceCents: 10000 });
    accId = acc.id;
    for (let i = 0; i < 14; i++) await fin.createTransaction(userId, { mode: "simple", kind: "EXPENSE", date: "2026-10-02", description: `Gasto ${i}`, amountCents: 100, moneyAccountId: acc.id });
    const other = await fin.createAccount(otherId, { name: "Ajena", type: "ASSET", openingBalanceCents: 5000 });
    await fin.createTransaction(otherId, { mode: "simple", kind: "EXPENSE", date: "2026-10-02", description: "Ajeno", amountCents: 100, moneyAccountId: other.id });
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("financeOverview: 12 últimos, saldo por cuenta y nada ajeno", async () => {
    const { financeOverview } = await import("./overview");
    const o = await financeOverview(userId);
    expect(o.recent).toHaveLength(12);
    expect(o.accounts.find((a) => a.id === accId)?.balanceCents).toBe(10000 - 1400);
    expect(o.recent.every((r) => r.description.startsWith("Gasto") || r.kind === "OPENING_BALANCE")).toBe(true);
    expect(JSON.stringify(o)).not.toContain("Ajeno");
  });

  it("historyView: límite, «más», cuenta ajena ignorada y saldo", async () => {
    const { historyView } = await import("./history-view");
    const all = await historyView(userId, { limit: "100" });
    expect(all.rows.length).toBe(15); // 14 gastos + apertura
    expect(all.more).toBe(false);
    expect(all.balanceLabel).toBe("Balance total");
    const foreign = (await prisma.financialAccount.findFirst({ where: { userId: otherId, name: "Ajena" } }))!.id;
    const spoof = await historyView(userId, { account: foreign });
    expect(spoof.filtered).toBe(false);
    expect(JSON.stringify(spoof)).not.toContain("Ajeno");
    const one = await historyView(userId, { account: accId, kind: "expense" });
    expect(one.filtered).toBe(true);
    expect(one.balanceLabel).toBe("Cuenta zona");
    expect(one.balanceCents).toBe(8600);
    expect(one.rows.every((r) => r.kind === "EXPENSE")).toBe(true);
  });

  it("nutritionDayView: solo las tomas del usuario de la sesión", async () => {
    const { nutritionDayView } = await import("@/lib/nutrition/day-view");
    const { createEntry } = await import("@/lib/nutrition/service");
    const e = { date: "2026-10-02", mealType: "LUNCH" as const, quantityG: 100, kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 };
    await createEntry(userId, { ...e, customName: "Mío" });
    await createEntry(otherId, { ...e, customName: "Ajeno" });
    const v = await nutritionDayView(userId, "2026-10-02");
    expect(v.day.entries.map((e) => e.customName)).toEqual(["Mío"]);
  });
});
