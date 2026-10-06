import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import {
  type BankMapping,
  csvToMovements,
  looksLikeNorma43,
  parseNorma43,
  type ParseResult,
} from "@/lib/finance/bank-import";
import { movementHashes } from "@/lib/finance/bank-import-hash";
import { createTransaction } from "@/lib/finance/service";
import { prisma } from "@/lib/prisma";

export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

/** UTF-8 estricto; si falla, Windows-1252 (lo que exportan muchos bancos españoles). */
export function decodeStatement(buf: Buffer): string {
  if (buf.length > MAX_STATEMENT_BYTES) throw new ApiError(413, "El extracto supera 5 MB");
  if (buf.includes(0)) throw new ApiError(415, "El fichero no es de texto (¿es un PDF o un Excel? Expórtalo como CSV)");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

async function moneyAccount(userId: string, accountId: string) {
  const acc = await prisma.financialAccount.findFirst({ where: { id: accountId, userId }, select: { id: true, type: true, name: true } });
  if (!acc) throw new ApiError(404, "Cuenta no encontrada");
  if (acc.type !== "ASSET" && acc.type !== "LIABILITY") throw new ApiError(400, "Elige una cuenta bancaria o de tarjeta");
  return acc;
}

function parse(text: string, mapping: BankMapping | null): ParseResult & { format: "CSV" | "N43" } {
  if (looksLikeNorma43(text)) return { ...parseNorma43(text), format: "N43" };
  if (!mapping) throw new ApiError(400, "Indica qué columna es cada dato (fecha, concepto e importe)");
  return { ...csvToMovements(text, mapping), format: "CSV" };
}

/** Vista previa: qué se importaría, qué ya existe y qué líneas tienen errores. */
export async function previewStatement(userId: string, accountId: string, text: string, mapping: BankMapping | null) {
  await moneyAccount(userId, accountId);
  const r = parse(text, mapping);
  const hashes = movementHashes(r.movements, accountId);
  const existing = new Set(
    (await prisma.financialTransaction.findMany({ where: { userId, importHash: { in: hashes } }, select: { importHash: true } })).map((t) => t.importHash),
  );
  const movements = r.movements.map((m, i) => ({ ...m, duplicate: existing.has(hashes[i]) }));
  return {
    format: r.format,
    movements,
    errors: r.errors,
    check: r.check ?? null,
    summary: {
      total: movements.length,
      new: movements.filter((m) => !m.duplicate).length,
      duplicates: movements.filter((m) => m.duplicate).length,
      inCents: movements.filter((m) => !m.duplicate && m.amountCents > 0).reduce((a, m) => a + m.amountCents, 0),
      outCents: movements.filter((m) => !m.duplicate && m.amountCents < 0).reduce((a, m) => a - m.amountCents, 0),
    },
  };
}

/**
 * Importa los movimientos nuevos (cada uno, un asiento de partida doble contra
 * Gastos/Ingresos). Idempotente: la huella única por usuario impide duplicar,
 * también si dos importaciones coinciden en el tiempo.
 */
export async function importStatement(userId: string, accountId: string, text: string, mapping: BankMapping | null) {
  await moneyAccount(userId, accountId);
  const r = parse(text, mapping);
  if (r.errors.some((e) => e.line === 0)) throw new ApiError(422, r.errors.find((e) => e.line === 0)!.message);
  const hashes = movementHashes(r.movements, accountId);
  let created = 0;
  let skipped = 0;
  for (let i = 0; i < r.movements.length; i++) {
    const m = r.movements[i];
    try {
      await createTransaction(
        userId,
        {
          mode: "simple",
          kind: m.amountCents < 0 ? "EXPENSE" : "INCOME",
          date: m.date,
          description: m.description.slice(0, 300),
          payee: m.payee,
          amountCents: Math.abs(m.amountCents),
          moneyAccountId: accountId,
        },
        { importHash: hashes[i] },
      );
      created++;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") skipped++;
      else throw err;
    }
  }
  return { format: r.format, created, skipped, errors: r.errors };
}
