// Importación de extractos bancarios: CSV (cualquier banco, con mapeo de
// columnas) y Norma 43 (formato AEB/CSB que ofrece la banca española).
// Puro y sin dependencias de Node: se usa también en el navegador para la vista de columnas.
import { z } from "zod";

export const bankMappingSchema = z
  .object({
    delimiter: z.enum([";", ",", "\t"]).default(";"),
    hasHeader: z.boolean().default(true),
    /** Líneas a saltar antes de la cabecera (muchos bancos ponen el titular arriba). */
    skipRows: z.number().int().min(0).max(50).default(0),
    dateCol: z.number().int().min(0),
    dateFormat: z.enum(["DD/MM/YYYY", "YYYY-MM-DD", "DD-MM-YYYY", "MM/DD/YYYY"]).default("DD/MM/YYYY"),
    descCol: z.number().int().min(0),
    payeeCol: z.number().int().min(0).nullish(),
    /** Una columna con signo, o dos (cargo / abono). */
    amountCol: z.number().int().min(0).nullish(),
    debitCol: z.number().int().min(0).nullish(),
    creditCol: z.number().int().min(0).nullish(),
    decimal: z.enum([",", "."]).default(","),
    /** Algunos bancos dan los gastos en positivo: invertir el signo. */
    invertSign: z.boolean().default(false),
  })
  .refine((m) => m.amountCol != null || (m.debitCol != null && m.creditCol != null), "Indica la columna de importe o las de cargo y abono");

export type BankMapping = z.infer<typeof bankMappingSchema>;

export interface Movement {
  /** Línea del fichero (1 = primera), para señalar errores. */
  line: number;
  date: string; // YYYY-MM-DD
  description: string;
  payee: string | null;
  /** Con signo: negativo = gasto (sale dinero de la cuenta). */
  amountCents: number;
}

export interface ParseResult {
  movements: Movement[];
  errors: Array<{ line: number; message: string }>;
  /** Solo Norma 43: saldos y totales declarados por el banco, para comprobar. */
  check?: { openingCents: number; closingCents: number; debitCents: number; creditCents: number; debitCount: number; creditCount: number };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** CSV según RFC 4180 (comillas, comillas dobladas, saltos de línea dentro de comillas, CRLF, BOM). */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** El separador más frecuente en las primeras líneas. */
export function detectDelimiter(text: string): ";" | "," | "\t" {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const counts = ([";", ",", "\t"] as const).map((d) => [d, sample.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** "1.234,56" / "-12,50" / "12,50-" / "(12.50)" / "1 234,56 €" → céntimos con signo. */
export function parseAmount(raw: string, decimal: "," | "."): number | null {
  let s = raw.replace(/[€$£\s ]/g, "").replace(/EUR/i, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const thousands = decimal === "," ? "." : ",";
  s = s.split(thousands).join("").replace(decimal, ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, frac = ""] = s.split(".");
  const cents = Number(int) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function parseDate(raw: string, format: BankMapping["dateFormat"]): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  const parts = s.split(/[/.\-]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  if (format === "YYYY-MM-DD") [y, m, d] = parts;
  else if (format === "MM/DD/YYYY") [m, d, y] = parts;
  else [d, m, y] = parts;
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export function csvToMovements(text: string, mapping: BankMapping): ParseResult {
  const rows = parseCsv(text, mapping.delimiter).slice(mapping.skipRows);
  const first = mapping.hasHeader ? 1 : 0;
  const movements: Movement[] = [];
  const errors: ParseResult["errors"] = [];
  rows.slice(first).forEach((r, i) => {
    const line = mapping.skipRows + first + i + 1;
    const date = parseDate(r[mapping.dateCol] ?? "", mapping.dateFormat);
    const description = (r[mapping.descCol] ?? "").trim().replace(/\s+/g, " ");
    let amount: number | null;
    if (mapping.amountCol != null) amount = parseAmount(r[mapping.amountCol] ?? "", mapping.decimal);
    else {
      const debit = parseAmount(r[mapping.debitCol!] ?? "", mapping.decimal);
      const credit = parseAmount(r[mapping.creditCol!] ?? "", mapping.decimal);
      amount = debit == null && credit == null ? null : (credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (!date) return errors.push({ line, message: `Fecha no válida: «${r[mapping.dateCol] ?? ""}»` });
    if (amount == null) return errors.push({ line, message: "Importe no válido" });
    if (amount === 0) return; // líneas informativas
    movements.push({
      line,
      date,
      description: description || "(sin concepto)",
      payee: mapping.payeeCol != null ? (r[mapping.payeeCol] ?? "").trim() || null : null,
      amountCents: mapping.invertSign ? -amount : amount,
    });
  });
  return { movements, errors };
}

// ---------------------------------------------------------------------------
// Norma 43 (AEB/CSB 43): registros de 80 caracteres
//   11 cabecera de cuenta · 22 movimiento · 23 concepto complementario
//   33 final de cuenta (totales y saldo) · 88 fin de fichero
// ---------------------------------------------------------------------------

const n43Date = (aammdd: string) => `20${aammdd.slice(0, 2)}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`;
const n43Amount = (digits: string, sign: string) => (sign === "1" ? -1 : 1) * Number(digits);

export function parseNorma43(text: string): ParseResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const movements: Movement[] = [];
  const errors: ParseResult["errors"] = [];
  let opening = 0;
  let check: ParseResult["check"];
  lines.forEach((raw, i) => {
    const l = raw.padEnd(80, " ");
    const line = i + 1;
    const type = l.slice(0, 2);
    if (!raw.trim()) return;
    if (type === "11") {
      opening = n43Amount(l.slice(33, 47), l.slice(32, 33)); // clave 1 = deudor
    } else if (type === "22") {
      const date = n43Date(l.slice(10, 16));
      if (!/^\d{12}$/.test(l.slice(10, 22)) || !/^\d{14}$/.test(l.slice(28, 42))) {
        errors.push({ line, message: "Registro 22 con formato inválido" });
        return;
      }
      movements.push({
        line,
        date,
        description: [l.slice(52, 64).trim(), l.slice(64, 80).trim()].filter(Boolean).join(" ") || "(sin concepto)",
        payee: null,
        amountCents: n43Amount(l.slice(28, 42), l.slice(27, 28)), // 1 = debe (cargo), 2 = haber (abono)
      });
    } else if (type === "23") {
      // Concepto complementario: sustituye/amplía al del movimiento anterior
      const last = movements.at(-1);
      const extra = [l.slice(4, 42).trim(), l.slice(42, 80).trim()].filter(Boolean).join(" ");
      if (last && extra) last.description = last.description === "(sin concepto)" ? extra : `${extra} · ${last.description}`;
    } else if (type === "33") {
      check = {
        openingCents: opening,
        debitCount: Number(l.slice(20, 25)),
        debitCents: Number(l.slice(25, 39)),
        creditCount: Number(l.slice(39, 44)),
        creditCents: Number(l.slice(44, 58)),
        closingCents: n43Amount(l.slice(59, 73), l.slice(58, 59)),
      };
    } else if (type !== "88") {
      errors.push({ line, message: `Tipo de registro desconocido: ${type}` });
    }
  });
  if (check) {
    const debit = movements.filter((m) => m.amountCents < 0);
    const credit = movements.filter((m) => m.amountCents > 0);
    const sum = (xs: Movement[]) => xs.reduce((a, m) => a + Math.abs(m.amountCents), 0);
    if (debit.length !== check.debitCount || sum(debit) !== check.debitCents || credit.length !== check.creditCount || sum(credit) !== check.creditCents) {
      errors.push({ line: 0, message: "Los movimientos no cuadran con los totales del registro 33 (fichero incompleto o dañado)" });
    } else if (check.openingCents + sum(credit) - sum(debit) !== check.closingCents) {
      errors.push({ line: 0, message: "El saldo final no cuadra con el inicial más los movimientos" });
    }
  }
  return { movements, errors, check };
}

export const looksLikeNorma43 = (text: string) => /^11\d{18}\d{12}/.test(text.replace(/^﻿/, "").slice(0, 40));

