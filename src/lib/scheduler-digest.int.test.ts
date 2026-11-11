// v2.8.0 B4 · O8 · el resumen diario hace las mismas lecturas con 5 que con 20 personas (sin consulta por persona).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { testStamp } from "@/test/stamp";

vi.mock("@/auth", () => ({ auth: async () => null }));

const counter = { n: 0, on: false };
vi.mock("@/lib/prisma", async () => {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@/generated/prisma/client");
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 5 }) });
  const prisma = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          if (counter.on) counter.n++;
          return query(args);
        },
      },
    },
  });
  return { prisma };
});

// El envío real queda fuera: se guarda lo que se avisaría a cada persona.
const sent = new Map<string, string>();
vi.mock("@/lib/push/service", async (orig) => ({
  ...(await orig<typeof import("@/lib/push/service")>()),
  notifyOnce: async (userId: string, _key: string, msg: { body?: string }) => {
    sent.set(userId, msg.body ?? "");
    return true;
  },
}));

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("resumen diario en lote (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let sched: typeof import("./scheduler");
  let dates: typeof import("@/lib/dates");
  const t = testStamp();
  let seq = 0;
  let withData = "";

  async function people(n: number) {
    for (let i = 0; i < n; i++) {
      const k = seq++;
      const u = await prisma.user.create({ data: { email: `dg${k}-${t}@test.dev` } });
      await prisma.pushSubscription.create({ data: { userId: u.id, endpoint: `https://push.example/dg-${k}-${t}`, p256dh: "B".repeat(87), auth: "A".repeat(22) } });
      // Cada persona tiene una suscripción (con cargo reciente) para que el cálculo de subidas de precio trabaje de verdad
      const bank = await prisma.financialAccount.create({ data: { userId: u.id, name: "Banco", type: "ASSET" } });
      const exp = await prisma.financialAccount.create({ data: { userId: u.id, name: "Gastos", type: "EXPENSE" } });
      const sub = await prisma.subscription.create({ data: { userId: u.id, name: "Musicaplus", amountCents: 1000, accountId: bank.id, nextChargeDate: dates.addDays(dates.today(), 20) } });
      await prisma.financialTransaction.create({
        data: {
          userId: u.id,
          date: dates.addDays(dates.today(), -3),
          kind: "EXPENSE",
          description: "Musicaplus",
          subscriptionId: sub.id,
          postings: { create: [{ accountId: bank.id, amountCents: -1000 }, { accountId: exp.id, amountCents: 1000 }] },
        },
      });
    }
  }

  async function run() {
    counter.n = 0;
    counter.on = true;
    sent.clear();
    try {
      await sched.runDailyDigestJob(12);
    } finally {
      counter.on = false;
    }
    return counter.n;
  }

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= "secreto-auth-de-prueba";
    prisma = (await import("@/lib/prisma")).prisma;
    dates = await import("@/lib/dates");
    sched = await import("./scheduler");
    // Una persona con subida de precio (cargo 1500 frente a 1000 guardados) y un cobro mañana
    const u = await prisma.user.create({ data: { email: `dgx-${t}@test.dev` } });
    withData = u.id;
    await prisma.pushSubscription.create({ data: { userId: u.id, endpoint: `https://push.example/dgx-${t}`, p256dh: "B".repeat(87), auth: "A".repeat(22) } });
    const bank = await prisma.financialAccount.create({ data: { userId: u.id, name: "Banco", type: "ASSET" } });
    const exp = await prisma.financialAccount.create({ data: { userId: u.id, name: "Gastos", type: "EXPENSE" } });
    const sub = await prisma.subscription.create({ data: { userId: u.id, name: "Videoplus", amountCents: 1000, accountId: bank.id, nextChargeDate: dates.addDays(dates.today(), 1) } });
    await prisma.financialTransaction.create({
      data: {
        userId: u.id,
        date: dates.addDays(dates.today(), -2),
        kind: "EXPENSE",
        description: "Videoplus",
        subscriptionId: sub.id,
        postings: { create: [{ accountId: bank.id, amountCents: -1500 }, { accountId: exp.id, amountCents: 1500 }] },
      },
    });
  });
  afterAll(async () => {
    const mine = { user: { email: { contains: `-${t}@test.dev` } } };
    await prisma.financialTransaction.deleteMany({ where: mine }); // los apuntes bloquean borrar las cuentas
    await prisma.user.deleteMany({ where: { email: { contains: `-${t}@test.dev` } } });
  });

  it("mismo nº de consultas con 5 que con 20 personas, y el aviso sale igual", async () => {
    await people(5);
    const a = await run();
    expect(sent.get(withData)).toMatch(/Videoplus/);
    expect(sent.get(withData)).toMatch(/te cobra más que antes/);
    await people(15);
    const b = await run();
    console.log(`[O8] consultas del resumen diario: ${a} (5 personas) · ${b} (20 personas)`);
    expect(b).toBe(a);
  });
});
