// Edición de las líneas de un asiento ya existente (transferencias y asientos partidos). Sin servidor.
// Regla: se cambian importes, cuentas, categorías y notas de las líneas que ya hay; ni se añaden ni se quitan.

import { assertBalanced, LedgerError, type PostingInput } from "@/lib/finance/ledger";

export interface LineInput extends PostingInput {
  id: string;
}

/** Error de forma: se añadió o quitó alguna línea (el servidor responde 409, no 400). */
export class LinesChangedError extends LedgerError {}

const isMoney = (type: string | undefined) => type === "ASSET" || type === "LIABILITY";

/**
 * Comprueba que `input` toca exactamente las mismas líneas que `current` (mismos ids, sin repetir) y que cuadra.
 *
 * @returns Las líneas en el orden recibido. Lanza `LinesChangedError` (añadir/quitar) o `LedgerError` (descuadre).
 */
export function planLineEdit(current: Array<{ id: string }>, input: LineInput[]): LineInput[] {
  const ids = new Set(input.map((l) => l.id));
  if (ids.size !== input.length) throw new LinesChangedError("Hay líneas repetidas");
  const known = new Set(current.map((l) => l.id));
  if (ids.size !== known.size || [...ids].some((id) => !known.has(id))) {
    throw new LinesChangedError("No se pueden añadir ni quitar líneas de un asiento");
  }
  assertBalanced(input);
  return input;
}

/** Una transferencia son dos líneas de dinero (activo o deuda), en cuentas distintas y de signo contrario. */
export function assertTransferShape(lines: PostingInput[], typeOf: (accountId: string) => string | undefined): void {
  if (lines.length !== 2) throw new LedgerError("Una transferencia tiene exactamente dos líneas");
  const [a, b] = lines;
  if (!isMoney(typeOf(a.accountId)) || !isMoney(typeOf(b.accountId))) throw new LedgerError("Una transferencia solo mueve dinero entre tus cuentas");
  if (a.accountId === b.accountId) throw new LedgerError("Las cuentas deben ser distintas");
  if (Math.sign(a.amountCents) === Math.sign(b.amountCents)) throw new LedgerError("Una transferencia sale de una cuenta y entra en otra");
}

/**
 * Reconstruye las dos líneas de una transferencia conservando sus ids: la que hoy es negativa sigue siendo el origen.
 *
 * @returns `[origen (−importe), destino (+importe)]`.
 */
export function transferLines(
  current: Array<{ id: string; amountCents: number }>,
  edit: { amountCents: number; fromAccountId: string; toAccountId: string; memo?: string | null },
): LineInput[] {
  if (current.length !== 2) throw new LinesChangedError("Una transferencia tiene exactamente dos líneas");
  if (!Number.isSafeInteger(edit.amountCents) || edit.amountCents <= 0) throw new LedgerError("El importe debe ser positivo");
  const from = current.find((l) => l.amountCents < 0) ?? current[0];
  const to = current.find((l) => l !== from)!;
  const memo = edit.memo?.trim() || null;
  return [
    { id: from.id, accountId: edit.fromAccountId, amountCents: -edit.amountCents, memo },
    { id: to.id, accountId: edit.toAccountId, amountCents: edit.amountCents, memo },
  ];
}

/** Lo que falta para cuadrar (0 = cuadra); para el indicador en vivo del formulario. */
export function linesImbalance(lines: Array<{ amountCents: number }>): number {
  return lines.reduce((s, l) => s + (Number.isFinite(l.amountCents) ? l.amountCents : 0), 0);
}

/** Mensaje común del 409 por cuenta archivada. */
export const archivedMessage = (name: string) => `La cuenta «${name}» está archivada: reactívala para anotar en ella`;
