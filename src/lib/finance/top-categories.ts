// v2.11 B2 (N10) · Categorías más usadas para los atajos de un toque del registro rápido. Puro.

export interface CategoryUse {
  transactionId: string;
  categoryId: string;
  name: string;
  /** Tipo de la categoría (no del movimiento): EXPENSE o INCOME. */
  kind: string;
}

export interface FrequentCategories {
  EXPENSE: string[];
  INCOME: string[];
}

/** Días hacia atrás que cuentan para «frecuente». */
export const FREQUENT_WINDOW_DAYS = 90;
export const FREQUENT_LIMIT = 6;

/**
 * Ids de las categorías más usadas por tipo. Cuenta movimientos distintos (un asiento con dos
 * líneas de la misma categoría vale 1); empate → nombre, para que el orden no baile.
 */
export function topCategories(rows: CategoryUse[], limit = FREQUENT_LIMIT): FrequentCategories {
  const seen = new Map<string, { name: string; kind: string; txs: Set<string> }>();
  for (const r of rows) {
    const e = seen.get(r.categoryId) ?? { name: r.name, kind: r.kind, txs: new Set<string>() };
    e.txs.add(r.transactionId);
    seen.set(r.categoryId, e);
  }
  const pick = (kind: "EXPENSE" | "INCOME") =>
    [...seen.entries()]
      .filter(([, e]) => e.kind === kind)
      .sort(([, a], [, b]) => b.txs.size - a.txs.size || a.name.localeCompare(b.name, "es"))
      .slice(0, limit)
      .map(([id]) => id);
  return { EXPENSE: pick("EXPENSE"), INCOME: pick("INCOME") };
}
