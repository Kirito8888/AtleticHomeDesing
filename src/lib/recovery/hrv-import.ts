import { parseCsv } from "@/lib/finance/bank-import";
import type { Prefs } from "@/lib/rules/prefs";

/** Importar VFC, FC en reposo y sueño desde un CSV (HRV4Training, Elite HRV, Garmin…). Puro. */
export type HrvMapping = NonNullable<Prefs["hrvCsvMapping"]>;
export type HrvRow = { line: number; date: string; hrvRmssdMs: number | null; restingHr: number | null; sleepHours: number | null };

function parseDay(raw: string, format: HrvMapping["dateFormat"]): string | null {
  const s = raw.trim().split(/[ T]/)[0];
  const parts = s.split(/[/.\-]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  let y: number, m: number, d: number;
  if (format === "YYYY-MM-DD") [y, m, d] = parts;
  else if (format === "MM/DD/YYYY") [m, d, y] = parts;
  else [d, m, y] = parts;
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const num = (raw: string | undefined) => {
  if (raw == null || !raw.trim()) return null;
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function hrvCsvRows(text: string, m: HrvMapping): { rows: HrvRow[]; errors: Array<{ line: number; message: string }> } {
  const table = parseCsv(text, m.delimiter);
  const rows: HrvRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (r.every((c) => !c.trim())) return;
    const date = parseDay(r[m.dateCol] ?? "", m.dateFormat);
    if (!date) return errors.push({ line, message: "Fecha no válida" });
    const hrv = m.hrvCol == null ? null : num(r[m.hrvCol]);
    const rhr = m.rhrCol == null ? null : num(r[m.rhrCol]);
    const sleepRaw = m.sleepCol == null ? null : num(r[m.sleepCol]);
    const sleep = sleepRaw == null ? null : m.sleepUnit === "min" ? Math.round((sleepRaw / 60) * 100) / 100 : sleepRaw;
    const ok = (v: number | null, lo: number, hi: number) => (v == null || (v >= lo && v <= hi) ? v : NaN);
    const v = { hrv: ok(hrv, 1, 300), rhr: ok(rhr, 25, 150), sleep: ok(sleep, 0, 24) };
    if (Object.values(v).some((x) => Number.isNaN(x))) return errors.push({ line, message: "Valor fuera de rango" });
    if (v.hrv == null && v.rhr == null && v.sleep == null) return;
    // Varias filas del mismo día: se queda la última
    const prev = rows.findIndex((x) => x.date === date);
    const row = { line, date, hrvRmssdMs: v.hrv, restingHr: v.rhr == null ? null : Math.round(v.rhr), sleepHours: v.sleep };
    if (prev >= 0) rows[prev] = row;
    else rows.push(row);
  });
  return { rows, errors };
}
