// v1.10 · Calendario de la federación o del club desde el fichero que descargas (Excel o PDF).
// Sin *scraping*. Puro (sin BD) para poder probarlo; el .ics y el CSV ya los lee competition-tools.ts.
import { unzipSync } from "fflate";

import type { ImportedEvent } from "@/lib/training/competition-tools";

const MAX_XML = 20 * 1024 * 1024;
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

/** Filas de la primera hoja de un .xlsx (texto de cada celda; las fechas de Excel quedan como número). */
export function readXlsxRows(buf: Uint8Array): string[][] {
  let total = 0;
  const files = unzipSync(buf, {
    filter: (f) => {
      const want = f.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet1\.xml$/.test(f.name) || f.name === "xl/workbook.xml";
      if (want) total += f.originalSize;
      if (total > MAX_XML) throw new Error("Excel demasiado grande");
      return want;
    },
  });
  const td = new TextDecoder();
  const sheet = files["xl/worksheets/sheet1.xml"];
  if (!sheet) throw new Error("No es un Excel (.xlsx) válido");
  const shared = files["xl/sharedStrings.xml"] ? [...td.decode(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""))) : [];
  const col = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows: string[][] = [];
  for (const r of td.decode(sheet).matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    // Las filas vacías no vienen en el XML: se respeta su número (r="3" = tercera fila)
    const n = Number(r[1].match(/\br="(\d+)"/)?.[1] ?? rows.length + 1);
    while (rows.length < n - 1) rows.push([]);
    const row: string[] = [];
    for (const c of r[2].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const inner = c[2] ?? "";
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const text = type === "s" ? shared[Number(v)] : type === "inlineStr" ? decode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")) : v != null ? decode(v) : "";
      row[ref ? col(ref) : row.length] = (text ?? "").trim();
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «15/02/2026», «15-2-26», «2026-02-15», «15 de febrero de 2026», «15 feb» (con el año de referencia) o número de serie de Excel. */
export function parseLooseDate(raw: string, yearHint?: number): string | null {
  const s = raw.trim().toLowerCase();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const es = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (es) return ymd(es[3].length === 2 ? 2000 + Number(es[3]) : Number(es[3]), Number(es[2]), Number(es[1]));
  const txt = s.match(/^(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),?\s+)?(\d{1,2})\s+(?:de\s+)?([a-zé]{3,})\.?(?:\s+(?:de\s+)?(\d{4}))?/);
  if (txt) {
    const m = MONTHS.findIndex((mm) => mm.startsWith(txt[2].slice(0, 3)));
    const y = txt[3] ? Number(txt[3]) : yearHint;
    if (m >= 0 && y) return ymd(y, m + 1, Number(txt[1]));
  }
  // Número de serie de Excel (días desde 1899-12-30) entre 1982 y 2064
  if (/^\d{5}(\.\d+)?$/.test(s) && Number(s) > 30000 && Number(s) < 60000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5).toISOString().slice(0, 10);
  return null;
}

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Filas de una hoja → competiciones. Si hay cabecera («fecha», «competición/prueba/campeonato»,
 * «lugar/sede/localidad»), se usan esas columnas; si no, la primera con fecha y la siguiente con texto.
 */
export function eventsFromRows(rows: string[][]): ImportedEvent[] {
  const headerIdx = rows.findIndex((r) => r.some((c) => /^fecha/i.test(c)) && r.some((c) => /competici|campeonato|prueba|nombre|evento|control/i.test(c)));
  const header = headerIdx >= 0 ? rows[headerIdx].map((c) => c.toLowerCase()) : null;
  const iDate = header ? header.findIndex((c) => /^fecha/.test(c)) : -1;
  const iTitle = header ? header.findIndex((c) => /competici|campeonato|prueba|nombre|evento|control/.test(c)) : -1;
  const iPlace = header ? header.findIndex((c) => /lugar|sede|localidad|ciudad|instalaci/.test(c)) : -1;
  const out: ImportedEvent[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    let date: string | null = null;
    let title: string | null = null;
    let location: string | null = null;
    if (header) {
      date = parseLooseDate(r[iDate] ?? "");
      title = r[iTitle] || null;
      location = iPlace >= 0 ? r[iPlace] || null : null;
    } else {
      const di = r.findIndex((c) => parseLooseDate(c) != null);
      if (di < 0) continue;
      date = parseLooseDate(r[di]);
      const rest = r.slice(di + 1).filter((c) => /[a-záéíóúñ]/i.test(c));
      title = rest[0] ?? null;
      location = rest[1] ?? null;
    }
    if (date && title) out.push({ date, title: title.slice(0, 200), location: location?.slice(0, 200) ?? null });
  }
  return out;
}

/**
 * Texto de un PDF de calendario → competiciones: cada línea que empieza por una fecha. El año, si la
 * línea no lo trae, se toma del documento («Temporada 2026», «2025-2026»: de septiembre a diciembre el
 * primero, de enero a agosto el segundo).
 */
export function eventsFromPdfText(text: string): ImportedEvent[] {
  const years = [...text.matchAll(/\b(20\d{2})(?:\s*[-/]\s*(20\d{2}))?\b/g)].map((m) => [Number(m[1]), m[2] ? Number(m[2]) : null] as const);
  const season = years.find(([, b]) => b != null);
  const single = years[0]?.[0];
  const out: ImportedEvent[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    const m = line.match(/^((?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo),?\s+)?\d{1,2}(?:[/.-]\d{1,2}[/.-]\d{2,4}|\s+(?:de\s+)?[a-zé]{3,}\.?(?:\s+(?:de\s+)?\d{4})?))\s+[-–·:]?\s*(.+)$/i);
    if (!m) continue;
    let date = parseLooseDate(m[1], single);
    if (date && season && !/\d{4}/.test(m[1])) {
      const month = Number(date.slice(5, 7));
      date = `${month >= 9 ? season[0] : season[1]}${date.slice(4)}`;
    }
    const rest = m[2].trim();
    if (!date || rest.length < 3) continue;
    // «Nombre (Lugar)» o «Nombre - Lugar»
    const place = rest.match(/^(.*?)\s*(?:\(([^)]+)\)|\s[-–]\s([^-–]+))$/);
    out.push({ date, title: (place?.[1] || rest).slice(0, 200), location: (place?.[2] ?? place?.[3] ?? null)?.trim().slice(0, 200) ?? null });
  }
  return out;
}
