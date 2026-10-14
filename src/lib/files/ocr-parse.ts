/**
 * v1.10 · Interpretar el texto que devuelve el OCR. Puro (se prueba sin Tesseract). Solo propone:
 * nada se guarda sin que la persona lo revise.
 */

/** «1.234,56», «12,5», «12.50» → número; null si no lo es. */
export function parseEsNumber(raw: string): number | null {
  let s = raw.trim().replace(/[€\s]/g, "");
  if (!/\d/.test(s)) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const MONEY = /(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+[.,]\d{2})(?!\d)/g;

/** Ticket o factura: importe total, fecha y comercio (lo que se encuentre). */
export function parseReceiptText(text: string): { amount: number | null; date: string | null; merchant: string | null } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Importe: la línea de TOTAL (no «subtotal» ni «total IVA»); si no, la mayor cantidad del ticket
  let amount: number | null = null;
  for (const l of lines) {
    if (/\b(total|importe|a pagar|total a pagar)\b/i.test(l) && !/sub\s?total|base|iva|impuesto|entregado|cambio/i.test(l)) {
      const m = [...l.matchAll(MONEY)].map((x) => parseEsNumber(x[1])).filter((n): n is number => n != null);
      if (m.length) amount = m.at(-1)!;
    }
  }
  if (amount == null) {
    const all = lines.flatMap((l) => [...l.matchAll(MONEY)].map((x) => parseEsNumber(x[1]))).filter((n): n is number => n != null && n < 100_000);
    amount = all.length ? Math.max(...all) : null;
  }
  // Fecha: dd/mm/aaaa, dd-mm-aa o dd.mm.aaaa
  let date: string | null = null;
  const d = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (d) {
    const [day, month] = [Number(d[1]), Number(d[2])];
    const year = d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // Comercio: la primera línea con letras que no sea un rótulo genérico
  const merchant =
    lines.find((l) => /[a-záéíóúñ]{3,}/i.test(l) && !/factura|simplificada|ticket|cif|nif|tel[eé]fono|fecha|hora|c\/|calle|avda|www\.|@/i.test(l) && l.length <= 60)?.replace(/\s{2,}/g, " ") ?? null;
  return { amount, date, merchant };
}

const LABEL_ROWS: Array<[string, RegExp]> = [
  ["satFatPer100g", /saturad/i],
  ["sugarsPer100g", /az[uú]car/i],
  ["fatPer100g", /grasas?\b/i],
  ["carbsPer100g", /hidratos|carbohidratos/i],
  ["fiberPer100g", /fibra/i],
  ["proteinPer100g", /prote[ií]nas?/i],
  ["saltPer100g", /\bsal\b/i],
  ["calciumPer100g", /calcio/i],
  ["ironPer100g", /hierro/i],
  ["vitDPer100g", /vitamina\s*d\b/i],
  ["b12Per100g", /vitamina\s*b\s*12/i],
  ["magnesiumPer100g", /magnesio/i],
  ["potassiumPer100g", /potasio/i],
];

/**
 * Tabla nutricional española (por 100 g en la primera columna, como manda el Reglamento 1169/2011).
 * Devuelve los valores encontrados; la energía se toma en kcal (o se convierte desde kJ).
 */
export function parseNutritionLabel(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const l of lines) {
    if (out.kcalPer100g == null && /energ|valor energ|kcal/i.test(l)) {
      const kcal = l.match(/(\d+(?:[.,]\d+)?)\s*kcal/i);
      const kj = l.match(/(\d+(?:[.,]\d+)?)\s*kj/i);
      if (kcal) out.kcalPer100g = parseEsNumber(kcal[1])!;
      else if (kj) out.kcalPer100g = Math.round(parseEsNumber(kj[1])! / 4.184);
      continue;
    }
    for (const [key, re] of LABEL_ROWS) {
      if (out[key] != null || !re.test(l)) continue;
      const n = l.replace(re, " ").match(/(<\s*)?(\d+(?:[.,]\d+)?)/);
      if (n) out[key] = n[1] ? 0 : parseEsNumber(n[2])!;
      break; // «de las cuales saturadas» no debe contar también como «grasas»
    }
  }
  return out;
}
