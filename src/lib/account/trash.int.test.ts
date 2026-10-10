// Integración con BD real (v1.8): papelera de sesiones, comidas y movimientos (deshacer y vaciar).
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("papelera v1.8 (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let trash: typeof import("./trash");
  let userId: string;
  let other: string;
  let dir: string;
  const saved = { ...process.env };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "lifeos-trash-"));
    process.env.UPLOAD_DIR = dir;
    process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.LIFEOS_NO_WEATHER = "1";
    vi.resetModules();
    prisma = (await import("@/lib/prisma")).prisma;
    trash = await import("./trash");
    const t = Date.now();
    userId = (await prisma.user.create({ data: { email: `tr1-${t}@test.dev`, athleteProfile: { create: {} } } })).id;
    other = (await prisma.user.create({ data: { email: `tr2-${t}@test.dev` } })).id;
  });
  afterAll(async () => {
    const { purgeUser } = await import("./service");
    for (const id of [userId, other]) await purgeUser(id);
    process.env = saved;
    await rm(dir, { recursive: true, force: true });
  });

  it("sesión: a la papelera y de vuelta con el mismo id, marcas y carga recalculadas", async () => {
    const { createTrainingSession } = await import("@/lib/training/service");
    const s = await createTrainingSession(userId, null, { date: "2026-10-05", type: "TECHNICAL", status: "COMPLETED", sessionRpe: 6, durationSec: 3600, tags: ["bloqueo"], technical: { event: "JAVELIN", implementWeightG: 800, isCompetition: false, attempts: [{ markM: 51.2, isFoul: false, isMeasured: true }] } } as never);
    expect(await prisma.personalRecord.count({ where: { userId, sessionId: s.id } })).toBe(1);
    const { id: tid } = await trash.trashSession(userId, s.id);
    expect(await prisma.trainingSession.count({ where: { id: s.id } })).toBe(0);
    expect(await prisma.personalRecord.count({ where: { userId } })).toBe(0);
    await expect(trash.restoreTrash(other, tid)).rejects.toThrow(/papelera/);
    expect(await trash.restoreTrash(userId, tid)).toMatchObject({ kind: "SESSION" });
    const back = await prisma.trainingSession.findUniqueOrThrow({ where: { id: s.id }, include: { technical: true } });
    expect(back).toMatchObject({ tags: ["bloqueo"], sessionRpe: 6 });
    expect(back.technical?.bestMarkM).toBe(51.2);
    expect(await prisma.personalRecord.count({ where: { userId, sessionId: s.id } })).toBe(1);
    expect(back.tss).not.toBeNull();
    expect(await prisma.trashItem.count({ where: { userId } })).toBe(0);
  }, 30_000);

  it("comida y movimiento (con su justificante) vuelven; vaciar borra el fichero", async () => {
    const meal = await prisma.macros.create({ data: { userId, date: new Date("2026-10-05"), mealType: "LUNCH", customName: "Lentejas", quantityG: 300, kcal: 350, proteinG: 20, carbsG: 50, fatG: 5 } });
    const { id: mt } = await trash.trashMeal(userId, meal.id);
    await trash.restoreTrash(userId, mt);
    expect(await prisma.macros.findUniqueOrThrow({ where: { id: meal.id } })).toMatchObject({ customName: "Lentejas", kcal: 350 });

    const { ensureDefaultAccounts, createTransaction } = await import("@/lib/finance/service");
    await ensureDefaultAccounts(userId);
    const bank = await prisma.financialAccount.create({ data: { userId, name: "Banco", type: "ASSET" } });
    const tx = await createTransaction(userId, { mode: "simple", kind: "EXPENSE", date: "2026-10-05", description: "Clavos", amountCents: 4500, moneyAccountId: bank.id, categoryId: null });
    const { addReceipt } = await import("@/lib/finance/season-service");
    const rc = await addReceipt(userId, tx.id, Buffer.from("%PDF-1.4\n% prueba\n"));
    const { id: tt } = await trash.trashTransaction(userId, tx.id);
    expect(await prisma.receipt.count({ where: { id: rc.id } })).toBe(0);
    expect(await readdir(path.join(dir, userId, "receipts"))).toHaveLength(1); // el fichero espera en disco
    await trash.restoreTrash(userId, tt);
    const back = await prisma.financialTransaction.findUniqueOrThrow({ where: { id: tx.id }, include: { postings: true, receipts: true } });
    expect(back.postings.reduce((a, p) => a + p.amountCents, 0)).toBe(0);
    expect(back.receipts.map((r) => r.id)).toEqual([rc.id]);

    // Vaciar: lo de hace más de 7 días se va con sus ficheros
    const { id: again } = await trash.trashTransaction(userId, tx.id);
    await prisma.trashItem.update({ where: { id: again }, data: { deletedAt: new Date(Date.now() - 8 * 864e5) } });
    expect(await trash.purgeTrash()).toBeGreaterThanOrEqual(1);
    expect(await readdir(path.join(dir, userId, "receipts"))).toHaveLength(0);
  });
});
