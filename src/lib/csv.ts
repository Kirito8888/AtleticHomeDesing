// CSV para Excel/LibreOffice en español: separador ";", coma decimal y BOM UTF-8.

export type CsvValue = string | number | boolean | Date | null | undefined;

const BOM = "﻿";

export function csvCell(v: CsvValue): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // Inyección de fórmulas: un texto que empieza por = + - @ se ejecutaría en la hoja de cálculo.
  const text = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return BOM + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
