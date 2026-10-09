// Integración con BD real: viaje con gastos enlazados, reembolso y aislamiento entre usuarios.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("viajes de competición (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("./trips-service");
  let fin: typeof import("./service");
  let userId: string;
  let otherId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("./trips-service");
    fin = await import("./service");
    userId = (await prisma.user.create({ data: { email: `trip-${Date.now()}@test.dev` } })).id;
    otherId = (await prisma.user.create({ data: { email: `trip2-${Date.now()}@test.dev` } })).id;
  });

  afterAll(async () => {
    // Mismo orden que el borrado de cuenta (FK RESTRICT de los apuntes)
    await prisma.financialTransaction.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  });

  it("enlaza gastos (quedan deportivos), suma frente al presupuesto y el reembolso", async () => {
    const money = await prisma.financialAccount.create({ data: { userId, name: "Banco", type: "ASSET" } });
    const tx = await fin.createTransaction(userId, { mode: "simple", kind: "EXPENSE", date: "2026-10-10", description: "Tren a León", amountCents: 4550, moneyAccountId: money.id });
    const trip = await svc.createTrip(userId, { name: "León", startsOn: "2026-10-10", budget: { transport: 4000, lodging: 6000 }, reimbursableCents: 3000 });

    await expect(svc.updateTrip(otherId, trip.id, { link: tx.id })).rejects.toThrow(/no encontrado/);
    await svc.updateTrip(userId, trip.id, { link: tx.id });
    const [t] = await svc.listTrips(userId);
    expect(t).toMatchObject({ spentCents: 4550, budgetCents: 10000, pendingCents: 3000, netCents: 1550 });
    expect(await prisma.financialTransaction.findUnique({ where: { id: tx.id }, select: { sport: true } })).toEqual({ sport: true });
    expect(await svc.unlinkedExpenses(userId)).toEqual([]);

    await svc.updateTrip(userId, trip.id, { reimbursed: true });
    expect((await svc.listTrips(userId))[0].pendingCents).toBe(0);

    await svc.deleteTrip(userId, trip.id);
    expect(await prisma.financialTransaction.findUnique({ where: { id: tx.id }, select: { tripId: true } })).toEqual({ tripId: null });
  });
});
