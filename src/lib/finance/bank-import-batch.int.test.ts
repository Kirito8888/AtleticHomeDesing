// v2.7.0 B3 · O5: el extracto se importa en lote (consultas casi constantes) con el mismo resultado
// que la ruta fila a fila (`createTransaction`): duplicados, categorías, saldos y orden del historial.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: async () => null }));

// Cliente real que cuenta cada operación enviada a la BD.
const counter = { n: 0, on: false };
vi.mock("@/lib/prisma", async () => {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@/generated/prisma/client");
  const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 5 }) });
  const prisma = base.$extends({
    query: {
      async $allOperations({ args, query }) {
        if (counter.on) counter.n++;
        return query(args);
      },
    },
  });
  return { prisma };
});

import { bankMappingSchema } from "./bank-import";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const mapping = bankMappingSchema.parse({ dateCol: 0, descCol: 1, amountCol: 2 });

/** Extracto sintético: gastos e ingresos, conceptos repetidos el mismo día y conceptos que casan reglas. */
function statement(lines: number): string {
  const rows = ["Fecha;Concepto;Importe"];
  const names = ["MERCADONA COMPRA", "CAFETERIA CENTRAL", "GIMNASIO CUOTA", "NOMINA EMPRESA", "BIZUM AMIGO", "LIBRERIA", "FARMACIA"];
  for (let i = 0; i < lines; i++) {
    const day = String(1 + (i % 28)).padStart(2, "0");
    const name = names[i % names.length];
    const cents = name.startsWith("NOMINA") || name.startsWith("BIZUM") ? 150000 + i : -(100 + ((i * 37) % 9000));
    rows.push(`${day}/10/2026;${name};${(cents / 100).toFixed(2).replace(".", ",")}`);
  }
  return rows.join("\n") + "\n";
}

describe.skipIf(!HAS_DB)("O5 · extracto en lote (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("@/lib/finance/bank-import-service");
  let fin: typeof import("@/lib/finance/service");
  const t = Date.now();
  let seq = 0;
  const users: string[] = [];

  async function setup(tag: string) {
    const userId = (await prisma.user.create({ data: { email: `o5${tag}${seq++}-${t}@test.dev` } })).id;
    users.push(userId);
    const accountId = (await prisma.financialAccount.create({ data: { userId, name: "Banco", type: "ASSET" } })).id;
    const mk = async (name: string, kind: "EXPENSE" | "INCOME") => (await prisma.financialCategory.create({ data: { userId, name, kind } })).id;
    const comida = await mk("Comida", "EXPENSE");
    const deporte = await mk("Deporte", "EXPENSE");
    const sueldo = await mk("Sueldo", "INCOME");
    await prisma.categoryRule.createMany({
      data: [
        { userId, pattern: "mercadona", categoryId: comida },
        { userId, pattern: "gimnasio", categoryId: deporte },
        { userId, pattern: "nomina", categoryId: sueldo },
        { userId, pattern: "bizum", categoryId: comida }, // kind cruzado: es ingreso y la regla es de gasto → sin categoría
      ],
    });
    return { userId, accountId };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("@/lib/finance/bank-import-service");
    fin = await import("@/lib/finance/service");
  });
  afterAll(async () => {
    for (const id of users) {
      await prisma.financialTransaction.deleteMany({ where: { userId: id } });
      await prisma.user.delete({ where: { id } });
    }
  });

  async function measure<T>(fn: () => Promise<T>): Promise<{ r: T; n: number }> {
    counter.n = 0;
    counter.on = true;
    try {
      return { r: await fn(), n: counter.n };
    } finally {
      counter.on = false;
    }
  }

  /** Foto comparable (sin ids ni fechas de creación): lo que ve la usuaria. */
  async function snapshot(userId: string, accountId: string) {
    const list = await fin.listTransactions(userId, { limit: 1000 });
    const cats = new Map((await prisma.financialCategory.findMany({ where: { userId } })).map((c) => [c.id, c.name]));
    return {
      balance: (await fin.listAccounts(userId)).find((a) => a.id === accountId)!.balanceCents,
      rows: list.map((x) => ({
        date: x.date.toISOString().slice(0, 10),
        kind: x.kind,
        description: x.description,
        hash: x.importHash?.length,
        postings: x.postings
          .map((p) => ({ amount: p.amountCents, cat: p.categoryId ? cats.get(p.categoryId) : null }))
          .sort((a, b) => a.amount - b.amount),
      })),
    };
  }

  it("consultas casi constantes: 200 líneas ≈ coste de 20", async () => {
    const small = await setup("s");
    const big = await setup("b");
    const a = await measure(() => svc.importStatement(small.userId, small.accountId, statement(20), mapping));
    const b = await measure(() => svc.importStatement(big.userId, big.accountId, statement(200), mapping));
    expect(a.r).toMatchObject({ created: 20, skipped: 0 });
    expect(b.r).toMatchObject({ created: 200, skipped: 0 });
    console.log(`O5 consultas: 20 líneas = ${a.n} · 200 líneas = ${b.n}`);
    expect(b.n).toBeLessThanOrEqual(15);
    expect(b.n).toBe(a.n);
  });

  it("mismo resultado que la ruta fila a fila (categorías, kinds, saldo y orden del historial)", async () => {
    const batch = await setup("x");
    const ref = await setup("r");
    const text = statement(120);
    await svc.importStatement(batch.userId, batch.accountId, text, mapping);

    // Referencia: el camino anterior, una línea cada vez con `createTransaction`.
    const { csvToMovements } = await import("./bank-import");
    const { movementHashes } = await import("./bank-import-hash");
    const { loadRules, ruleCategory } = await import("./category-rules-service");
    const mv = csvToMovements(text, mapping).movements;
    const hashes = movementHashes(mv, ref.accountId);
    const rules = await loadRules(ref.userId);
    for (let i = 0; i < mv.length; i++) {
      const m = mv[i];
      await fin.createTransaction(
        ref.userId,
        {
          mode: "simple",
          kind: m.amountCents < 0 ? "EXPENSE" : "INCOME",
          date: m.date,
          description: m.description.slice(0, 300),
          payee: m.payee,
          amountCents: Math.abs(m.amountCents),
          moneyAccountId: ref.accountId,
          categoryId: ruleCategory(rules, `${m.description} ${m.payee ?? ""}`, m.amountCents < 0 ? "EXPENSE" : "INCOME"),
        },
        { importHash: hashes[i] },
      );
    }
    expect(await snapshot(batch.userId, batch.accountId)).toEqual(await snapshot(ref.userId, ref.accountId));
  });

  it("reimportar y solapar: duplicados detectados igual, sin crear nada", async () => {
    const u = await setup("d");
    await svc.importStatement(u.userId, u.accountId, statement(60), mapping);
    const again = await svc.importStatement(u.userId, u.accountId, statement(60), mapping);
    expect(again).toMatchObject({ created: 0, skipped: 60 });
    const overlap = await svc.importStatement(u.userId, u.accountId, statement(80), mapping);
    expect(overlap).toMatchObject({ created: 20, skipped: 60 });
    expect(await prisma.financialTransaction.count({ where: { userId: u.userId } })).toBe(80);
    expect(await prisma.posting.count({ where: { transaction: { userId: u.userId } } })).toBe(160);
  });
});
