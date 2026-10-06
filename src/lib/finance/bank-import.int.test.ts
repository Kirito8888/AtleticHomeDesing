// Integración con BD real: importar extractos sin duplicar y con el saldo correcto.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bankMappingSchema } from "./bank-import";

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe.skipIf(!HAS_DB)("importación de extractos (BD real)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("@/lib/finance/bank-import-service");
  let finance: typeof import("@/lib/finance/service");
  let userId: string;
  let accountId: string;
  const mapping = bankMappingSchema.parse({ dateCol: 0, descCol: 1, amountCol: 2 });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = await import("@/lib/finance/bank-import-service");
    finance = await import("@/lib/finance/service");
    userId = (await prisma.user.create({ data: { email: `bank-${Date.now()}@test.dev` } })).id;
    accountId = (await prisma.financialAccount.create({ data: { userId, name: "Banco", type: "ASSET" } })).id;
  });
  afterAll(async () => {
    if (userId) {
      // Mismo orden que el borrado de cuenta (FK RESTRICT de los apuntes)
      await prisma.financialTransaction.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  const balance = async () => (await finance.listAccounts(userId)).find((a) => a.id === accountId)!.balanceCents;

  const octubre = "Fecha;Concepto;Importe\n01/10/2026;NOMINA;1.850,00\n03/10/2026;CAFETERIA;-1,50\n03/10/2026;CAFETERIA;-1,50\n05/10/2026;GIMNASIO;-45,00\n";
  // Extracto solapado: repite los dos cafés y el gimnasio, añade uno nuevo
  const solapado = "Fecha;Concepto;Importe\n03/10/2026;CAFETERIA;-1,50\n03/10/2026;CAFETERIA;-1,50\n05/10/2026;GIMNASIO;-45,00\n07/10/2026;LIBRERIA;-12,30\n";

  it("importa y el saldo de la cuenta es la suma de los movimientos", async () => {
    const preview = await svc.previewStatement(userId, accountId, octubre, mapping);
    expect(preview.summary).toMatchObject({ total: 4, new: 4, duplicates: 0, inCents: 185000, outCents: 4800 });
    const r = await svc.importStatement(userId, accountId, octubre, mapping);
    expect(r).toMatchObject({ created: 4, skipped: 0 });
    expect(await balance()).toBe(185000 - 150 - 150 - 4500);
  });

  it("reimportar el mismo extracto no duplica nada", async () => {
    const preview = await svc.previewStatement(userId, accountId, octubre, mapping);
    expect(preview.summary).toMatchObject({ new: 0, duplicates: 4 });
    const r = await svc.importStatement(userId, accountId, octubre, mapping);
    expect(r).toMatchObject({ created: 0, skipped: 4 });
    expect(await balance()).toBe(180200);
  });

  it("un extracto solapado solo añade lo nuevo (los dos cafés iguales siguen siendo dos)", async () => {
    const r = await svc.importStatement(userId, accountId, solapado, mapping);
    expect(r).toMatchObject({ created: 1, skipped: 3 });
    expect(await balance()).toBe(180200 - 1230);
    expect(await prisma.financialTransaction.count({ where: { userId, description: "CAFETERIA" } })).toBe(2);
  });

  it("rechaza cuentas ajenas o que no son bancarias", async () => {
    const other = await prisma.financialAccount.findFirst({ where: { userId, type: "EXPENSE" } });
    await expect(svc.previewStatement(userId, other!.id, octubre, mapping)).rejects.toThrow(/cuenta bancaria/);
    await expect(svc.previewStatement(userId, "no-existe", octubre, mapping)).rejects.toThrow(/no encontrada/);
  });

  it("decodifica extractos en Windows-1252", () => {
    const buf = Buffer.from([0x45, 0x53, 0x50, 0x41, 0xd1, 0x41]); // "ESPAÑA" en latin-1
    expect(svc.decodeStatement(buf)).toBe("ESPAÑA");
    expect(() => svc.decodeStatement(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]))).toThrow(/no es de texto/);
  });
});
