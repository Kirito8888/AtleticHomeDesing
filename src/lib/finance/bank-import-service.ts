import "server-only";

import { ApiError } from "@/lib/api";
import {
  type BankMapping,
  csvToMovements,
  looksLikeNorma43,
  parseNorma43,
  type ParseResult,
} from "@/lib/finance/bank-import";
import { movementHashes } from "@/lib/finance/bank-import-hash";
import { dateOnly } from "@/lib/dates";
import { assertBalanced, buildSimplePostings, LedgerError, type PostingInput } from "@/lib/finance/ledger";
import { ensureDefaultAccounts } from "@/lib/finance/service";
import { archivedMessage } from "@/lib/finance/edit-lines";
import { prisma } from "@/lib/prisma";
import { loadRules, ruleCategory } from "@/lib/finance/category-rules-service";

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
  const acc = await prisma.financialAccount.findFirst({ where: { id: accountId, userId }, select: { id: true, type: true, name: true, isArchived: true } });
  if (!acc) throw new ApiError(404, "Cuenta no encontrada");
  if (acc.type !== "ASSET" && acc.type !== "LIABILITY") throw new ApiError(400, "Elige una cuenta bancaria o de tarjeta");
  if (acc.isArchived) throw new ApiError(409, archivedMessage(acc.name));
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

/** Filas por sentencia de inserción (acota el nº de parámetros de cada consulta). */
const CHUNK = 1000;

/**
 * Importa los movimientos nuevos (cada uno, un asiento de partida doble contra
 * Gastos/Ingresos). Idempotente: la huella única por usuario impide duplicar,
 * también si dos importaciones coinciden en el tiempo.
 *
 * v2.7.0 · O5: en lote. Cuentas, reglas y categorías se leen una vez; los asientos se
 * arman en memoria (mismas reglas que `createTransaction`) y se insertan con
 * `createMany … skipDuplicates` (ON CONFLICT DO NOTHING sobre la huella) dentro de una
 * sola transacción: o entra todo lo nuevo o nada.
 */
export async function importStatement(userId: string, accountId: string, text: string, mapping: BankMapping | null) {
  await moneyAccount(userId, accountId);
  const r = parse(text, mapping);
  if (r.errors.some((e) => e.line === 0)) throw new ApiError(422, r.errors.find((e) => e.line === 0)!.message);
  if (!r.movements.length) return { format: r.format, created: 0, skipped: 0, errors: r.errors };
  const hashes = movementHashes(r.movements, accountId);
  // v1.8 · reglas aprendidas («aplicar a los parecidos»)
  const rules = await loadRules(userId);
  const defaults = await ensureDefaultAccounts(userId);

  const rows = r.movements.map((m, i) => {
    const kind = m.amountCents < 0 ? ("EXPENSE" as const) : ("INCOME" as const);
    const categoryId = ruleCategory(rules, `${m.description} ${m.payee ?? ""}`, kind);
    let postings: PostingInput[];
    try {
      postings = buildSimplePostings({
        kind,
        amountCents: Math.abs(m.amountCents),
        moneyAccountId: accountId,
        counterAccountId: kind === "EXPENSE" ? defaults.expense.id : defaults.income.id,
        categoryId,
      });
      assertBalanced(postings);
    } catch (err) {
      if (err instanceof LedgerError) throw new ApiError(400, err.message);
      throw err;
    }
    return { m, kind, hash: hashes[i], postings };
  });

  // Las categorías de las reglas deben ser de la usuaria (la misma comprobación que `createTransaction`).
  const categoryIds = [...new Set(rows.flatMap((x) => x.postings.flatMap((p) => (p.categoryId ? [p.categoryId] : []))))];
  if (categoryIds.length && (await prisma.financialCategory.count({ where: { userId, id: { in: categoryIds } } })) !== categoryIds.length) {
    throw new ApiError(400, "Alguna categoría no existe o no es tuya");
  }

  // `createdAt` crece con el orden del extracto: el historial (fecha desc, alta desc) queda como al importar fila a fila.
  const base = Date.now();
  const created = await prisma.$transaction(
    async (tx) => {
      let n = 0;
      for (let from = 0; from < rows.length; from += CHUNK) {
        const chunk = rows.slice(from, from + CHUNK);
        const inserted = await tx.financialTransaction.createManyAndReturn({
          data: chunk.map((x, j) => ({
            userId,
            date: dateOnly(x.m.date),
            kind: x.kind,
            description: x.m.description.slice(0, 300),
            payee: x.m.payee ?? null,
            importHash: x.hash,
            createdAt: new Date(base + from + j),
          })),
          skipDuplicates: true,
          select: { id: true, importHash: true },
        });
        const byHash = new Map(chunk.map((x) => [x.hash, x]));
        const postings = inserted.flatMap((t) =>
          byHash.get(t.importHash!)!.postings.map((p) => ({
            transactionId: t.id,
            accountId: p.accountId,
            amountCents: p.amountCents,
            categoryId: p.categoryId ?? null,
            memo: p.memo ?? null,
          })),
        );
        if (postings.length) await tx.posting.createMany({ data: postings });
        n += inserted.length;
      }
      return n;
    },
    { timeout: 60_000 },
  );
  return { format: r.format, created, skipped: rows.length - created, errors: r.errors };
}
