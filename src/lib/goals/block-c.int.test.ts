// Integración con BD real (v1.8 bloque C): objetivos, reglas de categoría, revisión semanal y posponer avisos.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("bloque C v1.8 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let userId: string;
  let other: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    process.env.LIFEOS_NO_WEATHER = "1";
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    const t = Date.now();
    userId = (await prisma.user.create({ data: { email: `bc1-${t}@test.dev`, athleteProfile: { create: {} } } })).id;
    other = (await prisma.user.create({ data: { email: `bc2-${t}@test.dev` } })).id;
  });
  afterAll(async () => {
    const { purgeUser } = await import("@/lib/account/service");
    for (const id of [userId, other]) await purgeUser(id);
    process.env = saved;
  });

  it("reglas de categoría: aprende, aplica a los parecidos y en la importación", async () => {
    const { createTransaction, listAccounts } = await import("@/lib/finance/service");
    const { categorizeTransaction } = await import("@/lib/finance/category-rules-service");
    const { importStatement } = await import("@/lib/finance/bank-import-service");
    const { toIsoDay, today } = await import("@/lib/dates");
    const bank = await prisma.financialAccount.create({ data: { userId, name: "Banco", type: "ASSET" } });
    await listAccounts(userId);
    const super_ = await prisma.financialCategory.create({ data: { userId, name: "Súper", kind: "EXPENSE" } });
    const day = toIsoDay(today());
    const mk = (d: string) => createTransaction(userId, { mode: "simple", kind: "EXPENSE", date: day, description: d, amountCents: 2000, moneyAccountId: bank.id });
    const a = await mk("COMPRA TARJ. 1234 MERCADONA VALENCIA");
    await mk("Mercadona Valencia 22/10");
    await mk("Renfe");
    const r = await categorizeTransaction(userId, a.id, super_.id, true);
    expect(r).toEqual({ pattern: "mercadona valencia", applied: 2 });
    // Otra persona no puede usar mi categoría
    await expect(categorizeTransaction(other, a.id, super_.id, false)).rejects.toThrow();
    // Importación: el concepto nuevo entra ya categorizado
    const csv = `fecha;concepto;importe\n${day.split("-").reverse().join("/")};MERCADONA VALENCIA CENTRO;-12,30\n`;
    const { bankMappingSchema } = await import("@/lib/finance/bank-import");
    const imp = await importStatement(userId, bank.id, csv, bankMappingSchema.parse({ dateCol: 0, descCol: 1, amountCol: 2 }));
    expect(imp.created).toBe(1);
    expect(await prisma.posting.count({ where: { categoryId: super_.id } })).toBe(3);
  }, 30_000);

  it("objetivos: gasto del mes y a mano, solo los propios", async () => {
    const { createGoal, listGoals, updateGoal } = await import("@/lib/goals/service");
    const cat = await prisma.financialCategory.findFirstOrThrow({ where: { userId, name: "Súper" } });
    await createGoal(userId, { kind: "BUDGET", title: "Súper < 100 €", target: 10000, linkRef: cat.id, higherIsBetter: true });
    const g = await createGoal(userId, { kind: "CUSTOM", title: "Libros", target: 12, current: 3, higherIsBetter: true });
    await expect(createGoal(other, { kind: "BUDGET", title: "x", target: 1, linkRef: cat.id, higherIsBetter: true })).rejects.toThrow(/Categoría/);
    await expect(updateGoal(other, g.id, { current: 5 })).rejects.toThrow();
    await updateGoal(userId, g.id, { current: 6 });
    const list = await listGoals(userId);
    const budget = list.find((x) => x.kind === "BUDGET")!;
    expect(budget.higherIsBetter).toBe(false);
    expect(budget.progress.current).toBeGreaterThanOrEqual(4000);
    expect(budget.progress.reached).toBe(true);
    expect(list.find((x) => x.id === g.id)!.progress).toMatchObject({ current: 6, pct: 0.5 });
  });

  it("revisión semanal: guarda el foco y el panel lo muestra", async () => {
    const { saveReview, currentFocus, reviewWeek } = await import("@/lib/review/service");
    const { toIsoDay } = await import("@/lib/dates");
    await saveReview(userId, { weekStart: toIsoDay(reviewWeek()), wentWell: "Constancia", change: null, focus: "Dormir 8 h" });
    expect(await currentFocus(userId)).toBe("Dormir 8 h");
    expect(await currentFocus(other)).toBeNull();
  });

  it("posponer: vuelve como no leída y se reenvía al vencer", async () => {
    const { notifyOnce, snoozeNotification, runSnoozedJob } = await import("@/lib/push/service");
    await notifyOnce(userId, `t-${Date.now()}`, { title: "Prueba", body: "Hola", url: "/" });
    const n = await prisma.notificationLog.findFirstOrThrow({ where: { userId, title: "Prueba" } });
    expect(await snoozeNotification(other, n.id)).toBe(false);
    const now = new Date();
    expect(await snoozeNotification(userId, n.id, 60, now)).toBe(true);
    // Antes de la hora no se reenvía (el total del job depende de otras filas de la BD: se mira la propia)
    await runSnoozedJob(new Date(now.getTime() + 30 * 60_000));
    expect((await prisma.notificationLog.findUniqueOrThrow({ where: { id: n.id } })).snoozeUntil).not.toBeNull();
    await runSnoozedJob(new Date(now.getTime() + 61 * 60_000));
    const after = await prisma.notificationLog.findUniqueOrThrow({ where: { id: n.id } });
    expect(after.snoozeUntil).toBeNull();
    expect(after.readAt).toBeNull();
  });
});
