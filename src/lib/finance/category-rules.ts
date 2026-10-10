import { z } from "zod";

/** Palabras de relleno de los conceptos bancarios que no identifican al comercio. */
const NOISE = new Set([
  "compra", "compras", "tarj", "tarjeta", "pago", "pagos", "recibo", "recibos", "transferencia", "transf", "trf", "bizum", "cargo", "adeudo", "abono", "sepa", "domiciliacion",
  "en", "de", "del", "la", "el", "los", "las", "con", "por", "para", "y", "a", "sl", "sa", "slu", "es", "esp", "espana", "ref", "num", "op", "contactless", "visa", "mastercard", "debito", "credito", "fecha",
]);

/** Minúsculas, sin acentos ni signos, espacios simples. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Patrón de un concepto: las dos primeras palabras significativas (sin números ni relleno).
 * «COMPRA TARJ. 1234 MERCADONA VALENCIA» → «mercadona valencia».
 */
export function patternFor(description: string): string | null {
  const words = normalizeText(description)
    .split(" ")
    .filter((w) => w.length >= 3 && !/\d/.test(w) && !NOISE.has(w));
  return words.length ? words.slice(0, 2).join(" ") : null;
}

/** La regla más específica (patrón más largo) contenida en el concepto. */
export function matchRule<T extends { pattern: string }>(rules: T[], description: string): T | null {
  const text = normalizeText(description);
  let best: T | null = null;
  for (const r of rules) if (text.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  return best;
}

export const categorizeSchema = z.object({ categoryId: z.string().min(1).max(40), similar: z.boolean().default(false) });
