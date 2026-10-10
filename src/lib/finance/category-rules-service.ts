import "server-only";

import { ApiError } from "@/lib/api";
import { matchRule, normalizeText, patternFor } from "@/lib/finance/category-rules";
import { prisma } from "@/lib/prisma";

const COUNTER = { in: ["INCOME", "EXPENSE"] as ("INCOME" | "EXPENSE")[] };

/**
 * v1.8 · Pone la categoría a un movimiento. Con «aplicar a los parecidos» guarda la regla
 * (para las próximas importaciones) y la aplica ya a los movimientos sin categoría que encajan.
 */
export async function categorizeTransaction(userId: string, txId: string, categoryId: string, similar: boolean) {
  const [tx, cat] = await Promise.all([
    prisma.financialTransaction.findFirst({ where: { id: txId, userId }, select: { id: true, kind: true, description: true } }),
    prisma.financialCategory.findFirst({ where: { id: categoryId, userId }, select: { id: true, kind: true } }),
  ]);
  if (!tx) throw new ApiError(404, "Movimiento no encontrado");
  if (!cat) throw new ApiError(400, "Categoría no encontrada");
  if (tx.kind !== cat.kind) throw new ApiError(400, cat.kind === "EXPENSE" ? "Es una categoría de gasto" : "Es una categoría de ingreso");
  await prisma.posting.updateMany({ where: { transactionId: tx.id, account: { type: COUNTER } }, data: { categoryId } });
  if (!similar) return { pattern: null, applied: 1 };

  const pattern = patternFor(tx.description);
  if (!pattern) return { pattern: null, applied: 1 };
  await prisma.categoryRule.upsert({ where: { userId_pattern: { userId, pattern } }, create: { userId, pattern, categoryId }, update: { categoryId } });
  const candidates = await prisma.financialTransaction.findMany({
    where: { userId, kind: tx.kind, id: { not: tx.id }, postings: { some: { categoryId: null, account: { type: COUNTER } } } },
    select: { id: true, description: true },
    take: 2000,
  });
  const ids = candidates.filter((c) => normalizeText(c.description).includes(pattern)).map((c) => c.id);
  if (ids.length) await prisma.posting.updateMany({ where: { transactionId: { in: ids }, account: { type: COUNTER } }, data: { categoryId } });
  return { pattern, applied: ids.length + 1 };
}

/** Reglas del usuario con el tipo de su categoría (para no poner una de gasto a un ingreso). */
export const loadRules = (userId: string) =>
  prisma.categoryRule.findMany({ where: { userId }, select: { pattern: true, categoryId: true, category: { select: { kind: true } } } });

export function ruleCategory(rules: Awaited<ReturnType<typeof loadRules>>, description: string, kind: "EXPENSE" | "INCOME") {
  return matchRule(rules.filter((r) => r.category.kind === kind), description)?.categoryId ?? null;
}

export const listRules = (userId: string) =>
  prisma.categoryRule.findMany({ where: { userId }, orderBy: { pattern: "asc" }, select: { id: true, pattern: true, category: { select: { name: true } } } });

export async function deleteRule(userId: string, id: string) {
  const r = await prisma.categoryRule.deleteMany({ where: { id, userId } });
  if (!r.count) throw new ApiError(404, "Regla no encontrada");
}
