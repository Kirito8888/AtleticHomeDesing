// Integración con BD real (v1.7): presupuesto de temporada, justificantes cifrados, subidas de precio
// y cuentas demo (datos sintéticos).
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const PDF = Buffer.from("%PDF-1.4\n% justificante sintético\n");

describe.skipIf(!HAS_DB)("finanzas y demo v1.7 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./season-service");
  let userId: string;
  let other: string;
  let dir: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lifeos-receipts-"));
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.UPLOAD_DIR = dir;
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./season-service");
    const t = Date.now();
    userId = (await prisma.user.create({ data: { email: `fi1-${t}@test.dev` } })).id;
    other = (await prisma.user.create({ data: { email: `fi2-${t}@test.dev` } })).id;
  });
  afterAll(async () => {
    const { purgeUser } = await import("@/lib/account/service");
    for (const id of [userId, other]) await purgeUser(id);
    process.env = saved;
    await rm(dir, { recursive: true, force: true });
  });

  async function expense(u: string, description: string, cents: number, date: string, extra: Record<string, unknown> = {}) {
    const { ensureDefaultAccounts, createTransaction } = await import("./service");
    await ensureDefaultAccounts(u);
    const money = (await prisma.financialAccount.findFirst({ where: { userId: u, type: "ASSET" } })) ?? (await prisma.financialAccount.create({ data: { userId: u, name: "Banco", type: "ASSET" } }));
    const tx = await createTransaction(u, { mode: "simple", kind: "EXPENSE", date, description, amountCents: cents, moneyAccountId: money.id, categoryId: null });
    if (Object.keys(extra).length) await prisma.financialTransaction.update({ where: { id: tx.id }, data: extra });
    return tx.id;
  }

  it("presupuesto de temporada con gasto deportivo y competiciones pendientes", async () => {
    await svc.saveSeasonBudget(userId, { season: 2026, lines: { gear: 300_00, travel: 500_00 }, perCompetitionCents: 50_00 });
    await expense(userId, "Zapatillas", 120_00, "2026-03-01", { sport: true });
    await expense(userId, "Cena", 30_00, "2026-03-02");
    await prisma.calendarEvent.create({ data: { userId, type: "COMPETITION", title: "Liga", startAt: new Date("2026-11-15T10:00:00Z"), endAt: new Date("2026-11-15T14:00:00Z") } });
    const v = await svc.seasonBudgetView(userId, 2026, "2026-10-10");
    expect(v).toMatchObject({ plannedCents: 800_00, spentCents: 120_00, upcomingCompetitions: 1, calendarCents: 170_00 });
  });

  it("justificantes: firma real, cifrados, solo su dueño, y se borran con el movimiento", async () => {
    const txId = await expense(userId, "Inscripción", 15_00, "2026-10-01");
    await expect(svc.addReceipt(userId, txId, Buffer.from("<html>"))).rejects.toThrow(/PDF/);
    await expect(svc.addReceipt(other, txId, PDF)).rejects.toThrow(/no encontrado/i);
    const r = await svc.addReceipt(userId, txId, PDF);
    expect((await svc.readReceipt(userId, r.id)).bytes.equals(PDF)).toBe(true);
    await expect(svc.readReceipt(other, r.id)).rejects.toThrow(/no encontrado/i);
    expect(await readdir(path.join(dir, userId, "receipts"))).toEqual([`${r.id}.pdf.enc`]);
    await svc.deleteTransactionWithReceipts(userId, txId);
    expect(await readdir(path.join(dir, userId, "receipts"))).toEqual([]);
    expect(await prisma.receipt.count({ where: { userId } })).toBe(0);
  });

  it("subidas de precio: por el cargo del banco y al editar el importe", async () => {
    await expense(userId, "Café", 150, "2026-10-02");
    const acc = await prisma.financialAccount.findFirstOrThrow({ where: { userId, type: "ASSET" } });
    const sub = await prisma.subscription.create({ data: { userId, name: "Música Premium", amountCents: 999, nextChargeDate: new Date("2026-11-01"), accountId: acc.id } });
    await expense(userId, "PAGO MUSICA PREMIUM", 1199, "2026-10-01");
    let a = await svc.subscriptionAlerts(userId, "2026-10-10");
    expect(a.charged).toEqual([expect.objectContaining({ subscriptionId: sub.id, chargedCents: 1199, pct: 20 })]);
    await svc.updateSubscription(userId, sub.id, { amountCents: 1199 }, "2026-10-10");
    a = await svc.subscriptionAlerts(userId, "2026-10-10");
    expect(a.charged).toEqual([]);
    expect(a.edited).toEqual([expect.objectContaining({ fromCents: 999, toCents: 1199 })]);
    await expect(svc.markPriceChangeSeen(other, a.edited[0].id)).rejects.toThrow(/no encontrado/i);
    await svc.markPriceChangeSeen(userId, a.edited[0].id);
    expect((await svc.subscriptionAlerts(userId, "2026-10-10")).edited).toEqual([]);
  });

  it("cuenta demo: sintética, con carga calculada, y se borra al caducar", async () => {
    const demo = await import("@/lib/demo/service");
    const d = await demo.createDemoAccount("RUNNER");
    expect(d.email).toMatch(/@demo\.lifeos\.invalid$/);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: d.email }, include: { _count: { select: { trainingSessions: true, routines: true } } } });
    expect(u.demoAudience).toBe("RUNNER");
    expect(u._count.trainingSessions).toBeGreaterThan(8);
    expect(u._count.routines).toBe(1);
    expect(await prisma.trainingSession.count({ where: { userId: u.id, status: "COMPLETED", tss: { not: null } } })).toBeGreaterThan(0);
    expect(await demo.pruneExpiredDemos(new Date())).toBe(0);
    expect(await demo.pruneExpiredDemos(new Date(Date.now() + 31 * 864e5))).toBeGreaterThanOrEqual(1);
    expect(await prisma.user.findUnique({ where: { email: d.email } })).toBeNull();
  }, 30_000);
});
