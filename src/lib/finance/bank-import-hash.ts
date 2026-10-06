// Huellas de los movimientos importados (solo servidor: usa node:crypto).
import { createHash } from "node:crypto";

import type { Movement } from "@/lib/finance/bank-import";

/**
 * Huella estable de cada movimiento: fecha|importe|concepto|n.º de aparición.
 * El n.º de aparición distingue dos cafés iguales el mismo día, y es el mismo
 * al reimportar el extracto (o uno que se solape), así que no se duplica nada.
 */
export function movementHashes(movements: Movement[], accountId: string): string[] {
  const seen = new Map<string, number>();
  return movements.map((m) => {
    const base = `${accountId}|${m.date}|${m.amountCents}|${m.description.toLowerCase()}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return createHash("sha256").update(`${base}|${n}`).digest("hex").slice(0, 40);
  });
}
