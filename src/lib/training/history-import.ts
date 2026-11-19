// Importar historial de entrenamientos desde .xlsx o .csv. Puro (sin BD): lo usan el navegador (leer, mapear, normalizar)
// y el servidor (volver a deduplicar y crear). Sin dependencias nuevas: fflate ya está instalado.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { detectDelimiter, parseCsv } from "@/lib/finance/bank-import";
import { toCsv } from "@/lib/csv";

export class HistoryImportError extends Error {}

export const HISTORY_LIMITS = {
  fileBytes: 2 * 1024 * 1024,
  unzippedBytes: 20 * 1024 * 1024,
  rows: 2000,
  cols: 30,
  importRows: 1000,
} as const;

export type Sheet = { name: string; rows: string[][] };
export type Spreadsheet = { sheets: Sheet[]; date1904: boolean };

// ---------------------------------------------------------------------------
// Lectura de ficheros
// ---------------------------------------------------------------------------

const unescapeXml = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : null;
};

/** Texto de un fragmento `<si>`/`<is>`: junta todos los `<t>` (texto con formato) e ignora los fonéticos. */
const richText = (xml: string) =>
  [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function colLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function parseSheetXml(xml: string, shared: string[]): string[][] {
  const grid: string[][] = [];
  let nextRow = 0;
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const ref = /^([A-Z]+)(\d+)$/.exec(attr(attrs, "r") ?? "");
    if (!ref) continue;
    const c = colIndex(ref[1]);
    const r = Number(ref[2]) - 1;
    if (c >= HISTORY_LIMITS.cols || r >= HISTORY_LIMITS.rows) continue;
    const body = m[2] ?? "";
    const t = attr(attrs, "t");
    let value = "";
    if (t === "inlineStr") value = richText(body);
    else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (v != null) {
        const raw = unescapeXml(v);
        value = t === "s" ? (shared[Number(raw)] ?? "") : t === "b" ? (raw === "1" ? "TRUE" : "FALSE") : raw;
      }
    }
    if (value === "") continue;
    while (grid.length <= r) grid.push([]);
    const row = grid[r];
    while (row.length <= c) row.push("");
    row[c] = value;
    nextRow = Math.max(nextRow, r + 1);
  }
  grid.length = nextRow;
  return grid.map((row) => (row.length ? row : []));
}

function readXlsx(bytes: Uint8Array): Spreadsheet {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name)) return false;
        total += f.originalSize;
        if (total > HISTORY_LIMITS.unzippedBytes) throw new HistoryImportError("El Excel descomprimido ocupa demasiado.");
        return true;
      },
    });
  } catch (e) {
    if (e instanceof HistoryImportError) throw e;
    throw new HistoryImportError("No se pudo abrir el Excel (¿está dañado, cifrado o es un .xls antiguo?). Guárdalo como .xlsx o .csv.");
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : null);
  const workbook = text("xl/workbook.xml");
  if (!workbook) throw new HistoryImportError("El fichero no parece un Excel (.xlsx).");
  const rels = new Map<string, string>();
  for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, "xl/"));
  }
  const shared = [...(text("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => richText(m[1]));
  const date1904 = /<workbookPr\b[^>]*date1904="(?:1|true)"/.test(workbook);
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = attr(m[1], "name") ?? `Hoja ${sheets.length + 1}`;
    const rid = attr(m[1], "r:id");
    const xml = rid && rels.get(rid) ? text(rels.get(rid)!) : null;
    if (xml == null) continue;
    const rows = parseSheetXml(xml, shared);
    if (rows.some((r) => r.length)) sheets.push({ name, rows });
  }
  if (!sheets.length) throw new HistoryImportError("El Excel no tiene ninguna hoja con datos.");
  return { sheets, date1904 };
}

/** Lee un .xlsx o un .csv (por su contenido, no por la extensión). */
export function readSpreadsheet(bytes: Uint8Array, name = ""): Spreadsheet {
  if (bytes.length > HISTORY_LIMITS.fileBytes) throw new HistoryImportError("El fichero supera 2 MB.");
  if (bytes.length === 0) throw new HistoryImportError("El fichero está vacío.");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes);
  if (/\.xls$/i.test(name) || (bytes[0] === 0xd0 && bytes[1] === 0xcf)) {
    throw new HistoryImportError("Los .xls antiguos no se pueden leer: guárdalo como .xlsx o .csv.");
  }
  const text = strFromU8(bytes);
  const rows = parseCsv(text, detectDelimiter(text))
    .slice(0, HISTORY_LIMITS.rows)
    .map((r) => r.slice(0, HISTORY_LIMITS.cols).map((c) => c.trim()));
  if (!rows.length) throw new HistoryImportError("El CSV no tiene filas.");
  return { sheets: [{ name: "CSV", rows }], date1904: false };
}

// ---------------------------------------------------------------------------
// Cabecera y mapeo de columnas
// ---------------------------------------------------------------------------

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export type Field = "date" | "title" | "type" | "duration" | "distance" | "rpe" | "load";
export const FIELDS: Field[] = ["date", "title", "type", "duration", "distance", "rpe", "load"];

const SYNONYMS: Record<Field | "notes", RegExp> = {
  date: /^(fecha|date|fecha .*|start date|dia y fecha)$/,
  title: /^(titulo|title|nombre|name|sesion|session|entrenamiento|workout)$/,
  type: /^(tipo|type|deporte|sport|actividad|activity|activity type|modalidad|disciplina)( .*)?$/,
  duration: /(duracion|duration|minutos|^min$|^mins$|^tiempo|^time$|moving time|elapsed time)/,
  distance: /(distancia|distance|^km$|kilometros|metros)/,
  rpe: /(^rpe|esfuerzo|percepcion|^borg)/,
  load: /^(carga|tss|load|training load|carga de entrenamiento)( .*)?$/,
  notes: /^(notas?|notes?|comentarios?|descripcion|description|que hice|observaciones|detalle)( .*)?$/,
};

export type Mapping = { date: number | null; title: number | null; type: number | null; duration: number | null; distance: number | null; rpe: number | null; load: number | null; notes: number[] };

const matches = (header: string[]) => header.map((h) => (Object.keys(SYNONYMS) as Array<Field | "notes">).find((f) => SYNONYMS[f].test(norm(h))) ?? null);

/** Primera fila (de las 15 primeras) con al menos dos columnas reconocibles; si no hay, la primera. */
export function detectHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (matches(rows[i]).filter(Boolean).length >= 2) return i;
  }
  return 0;
}

export function guessMapping(header: string[]): Mapping {
  const found = matches(header);
  const m: Mapping = { date: null, title: null, type: null, duration: null, distance: null, rpe: null, load: null, notes: [] };
  found.forEach((f, i) => {
    if (f === "notes") m.notes.push(i);
    else if (f && m[f] == null) m[f] = i;
  });
  return m;
}

/** Unidad probable según la cabecera («Duración (h)», «Distancia (m)»). */
export function guessUnits(header: string[], m: Mapping): { duration: "min" | "h" | "s"; distance: "km" | "m" } {
  const d = m.duration != null ? norm(header[m.duration] ?? "") : "";
  const k = m.distance != null ? norm(header[m.distance] ?? "") : "";
  return {
    duration: /\b(h|horas?|hours?)\b/.test(d) ? "h" : /\b(s|seg|segundos?|sec|seconds?)\b/.test(d) ? "s" : "min",
    distance: /\b(m|metros?)\b/.test(k) && !/\bkm\b/.test(k) ? "m" : "km",
  };
}

// ---------------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------------

/** "5,2" · "1.234,5" · "1,234.5" · "1 234" → número. */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  let t = s;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.split(",").length > 2 ? t.replace(/,/g, "") : t.replace(",", ".");
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function validIso(y: number, mo: number, d: number): string | null {
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** ISO, dd/mm/aaaa (también `-` y `.`), o número de serie de Excel. */
export function parseDateCell(raw: string, date1904 = false): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return validIso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let d = Number(m[1]);
    let mo = Number(m[2]);
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validIso(y, mo, d);
  }
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial < 20000 || serial > 80000) return null;
    const dt = new Date((serial - (date1904 ? 24107 : 25569)) * 86_400_000);
    return validIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}

/** "90" · "90 min" · "1:30" · "1:30:00" · "1h30" · "1,5 h" · fracción de día de Excel → segundos. */
export function parseDurationSec(raw: string, unit: "min" | "h" | "s" = "min"): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let sec: number | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(s))) sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
  else if ((m = /^(\d+(?:[.,]\d+)?)\s*h(?:oras?)?\s*(?:(\d+)\s*(?:m|min|')?)?$/.exec(s))) sec = Number(m[1].replace(",", ".")) * 3600 + Number(m[2] ?? 0) * 60;
  else if ((m = /^(\d+(?:[.,]\d+)?)\s*(?:min|mins|m|minutos?|')$/.exec(s))) sec = Number(m[1].replace(",", ".")) * 60;
  else if ((m = /^(\d+)\s*(?:s|seg|segundos?)$/.exec(s))) sec = Number(m[1]);
  else {
    const n = parseNumber(s);
    if (n != null) sec = unit === "min" && n > 0 && n < 1 ? n * 86_400 : n * (unit === "h" ? 3600 : unit === "s" ? 1 : 60);
  }
  if (sec == null) return null;
  sec = Math.round(sec);
  return sec >= 1 && sec <= 86_400 ? sec : null;
}

/** "8,2" (km) · "5200 m" · "10 km" → metros. */
export function parseDistanceM(raw: string, unit: "km" | "m" = "km"): number | null {
  const m = /^([\d.,\s]+?)\s*(km|m|mi)?$/i.exec(raw.trim());
  if (!m) return null;
  const n = parseNumber(m[1]);
  if (n == null) return null;
  const u = (m[2] ?? unit).toLowerCase();
  const metres = Math.round(u === "km" ? n * 1000 : u === "mi" ? n * 1609.344 : n);
  return metres > 0 && metres <= 1_000_000 ? metres : null;
}

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

export type Modality = "RUN" | "SPRINT" | "HURDLES" | "SWIM" | "CYCLE" | "ROW" | "WALK" | "OTHER";
/** Serie de fuerza leída de la hoja «Series»: ejercicio por nombre (el servidor lo empareja con la biblioteca o lo crea). */
export type HistorySet = { exercise: string; reps: number; weightKg: number; notes?: string | null };
export type HistoryRow = {
  line: number;
  date: string;
  title: string;
  kind: "TRACK" | "STRENGTH" | "MIXED";
  modality?: Modality | null;
  distanceM?: number | null;
  durationSec?: number | null;
  rpe?: number | null;
  manualTss?: number | null;
  notes?: string | null;
  typeText?: string | null;
  sets?: HistorySet[];
  /** Duración o RPE puestos por el valor por defecto del importador, no leídos del fichero. */
  estimated?: boolean;
};
export type Defaults = { durationMin?: number | null; rpe?: number | null };
export type ParseResult = { rows: HistoryRow[]; skipped: Array<{ line: number; reason: string }>; issues: Array<{ line: number; message: string }> };

const REST = /\b(sin entrenar|descanso|rest|rest day|off|no entrene|no entrenado)\b/;

/** Tipo → disciplina de pista o fuerza; lo que no encaja queda como sesión mixta. */
export function classify(typeText: string): { kind: HistoryRow["kind"]; modality: Modality | null } {
  const t = norm(typeText);
  if (/(fuerza|gimnasio|gym|pesas|strength|weights?|musculacion|crossfit)/.test(t)) return { kind: "STRENGTH", modality: null };
  if (/(nata|swim|piscina)/.test(t)) return { kind: "TRACK", modality: "SWIM" };
  if (/(bici|cicl|bike|cycl)/.test(t)) return { kind: "TRACK", modality: "CYCLE" };
  if (/\b(remo|row|rowing)\b/.test(t)) return { kind: "TRACK", modality: "ROW" };
  if (/\b(andar|caminar|caminata|walk|walking|senderismo|hiking)\b/.test(t)) return { kind: "TRACK", modality: "WALK" };
  if (/(valla|hurdle)/.test(t)) return { kind: "TRACK", modality: "HURDLES" };
  if (/(sprint|velocidad)/.test(t)) return { kind: "TRACK", modality: "SPRINT" };
  if (/(corr|run|rodaje|series|carrera|trail|footing|jog)/.test(t)) return { kind: "TRACK", modality: "RUN" };
  return { kind: "MIXED", modality: null };
}

export function parseRows(sheet: Sheet, headerIdx: number, mapping: Mapping, opts: { date1904?: boolean; defaults?: Defaults; units?: { duration: "min" | "h" | "s"; distance: "km" | "m" } } = {}): ParseResult {
  const out: ParseResult = { rows: [], skipped: [], issues: [] };
  const units = opts.units ?? { duration: "min", distance: "km" };
  const cell = (row: string[], i: number | null) => (i == null ? "" : (row[i] ?? "").trim());
  for (let r = headerIdx + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row || row.every((c) => !c?.trim())) continue;
    const line = r + 1;
    const date = parseDateCell(cell(row, mapping.date), opts.date1904);
    if (!date) {
      out.skipped.push({ line, reason: "Sin fecha válida" });
      continue;
    }
    const typeText = cell(row, mapping.type);
    const titleRaw = cell(row, mapping.title);
    if (REST.test(norm(titleRaw)) || REST.test(norm(typeText))) {
      out.skipped.push({ line, reason: "Descanso" });
      continue;
    }
    const notes = mapping.notes.map((i) => cell(row, i)).filter(Boolean).join(" · ");
    let durationSec: number | null = null;
    const dRaw = cell(row, mapping.duration);
    if (dRaw) {
      durationSec = parseDurationSec(dRaw, units.duration);
      if (durationSec == null) out.issues.push({ line, message: `Duración no válida «${dRaw.slice(0, 20)}»` });
    }
    let distanceM: number | null = null;
    const kRaw = cell(row, mapping.distance);
    if (kRaw) {
      distanceM = parseDistanceM(kRaw, units.distance);
      if (distanceM == null) out.issues.push({ line, message: `Distancia no válida «${kRaw.slice(0, 20)}»` });
    }
    let rpe: number | null = null;
    const pRaw = cell(row, mapping.rpe);
    if (pRaw) {
      rpe = parseNumber(pRaw);
      if (rpe == null || rpe < 0 || rpe > 10) {
        out.issues.push({ line, message: `RPE no válido «${pRaw.slice(0, 20)}» (0–10)` });
        rpe = null;
      }
    }
    let manualTss: number | null = null;
    const cRaw = cell(row, mapping.load);
    if (cRaw) {
      manualTss = parseNumber(cRaw);
      if (manualTss == null || manualTss < 0 || manualTss > 2000) {
        out.issues.push({ line, message: `Carga no válida «${cRaw.slice(0, 20)}»` });
        manualTss = null;
      }
    }
    if (!titleRaw && !typeText && !notes && durationSec == null && distanceM == null && rpe == null && manualTss == null) {
      out.skipped.push({ line, reason: "Fila sin contenido" });
      continue;
    }
    let estimated = false;
    const def = opts.defaults ?? {};
    if (durationSec == null && def.durationMin && def.durationMin > 0) {
      durationSec = Math.round(def.durationMin * 60);
      estimated = true;
    }
    if (rpe == null && def.rpe != null && def.rpe > 0) {
      rpe = def.rpe;
      estimated = true;
    }
    const { kind, modality } = classify(typeText);
    const allNotes = [notes, estimated ? "Duración/RPE estimados al importar." : ""].filter(Boolean).join(" · ");
    out.rows.push({
      line,
      date,
      title: (titleRaw || typeText || "Sesión importada").slice(0, 120),
      kind: kind === "MIXED" && distanceM ? "MIXED" : kind,
      modality,
      distanceM,
      durationSec,
      rpe,
      manualTss,
      notes: allNotes ? allNotes.slice(0, 5000) : null,
      typeText: typeText ? typeText.slice(0, 30) : null,
      estimated,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hoja «Series» (fuerza): una fila por ejercicio y día → series sueltas dentro de la sesión de ese día
// ---------------------------------------------------------------------------

export const SERIES_LIMITS = { setsPerDay: 150, setsPerRow: 30 } as const;

const SERIES_SYNONYMS: Record<"date" | "exercise" | "series" | "reps" | "kg" | "notes", RegExp> = {
  date: /^(fecha|date)$/,
  exercise: /^(ejercicio|exercise)( .*)?$/,
  series: /^(series|sets|n series|numero de series)$/,
  reps: /^(reps|repeticiones|repeticiones por serie)$/,
  kg: /^(kg|peso|carga kg|peso kg|kilos)( .*)?$/,
  notes: /^(nota|notas|comentario|observaciones)( .*)?$/,
};
type SeriesCols = Record<keyof typeof SERIES_SYNONYMS, number | null>;

function seriesColumns(header: string[]): SeriesCols {
  const out: SeriesCols = { date: null, exercise: null, series: null, reps: null, kg: null, notes: null };
  header.forEach((h, i) => {
    const key = (Object.keys(SERIES_SYNONYMS) as Array<keyof SeriesCols>).find((k) => out[k] == null && SERIES_SYNONYMS[k].test(norm(h)));
    if (key) out[key] = i;
  });
  return out;
}

/** ¿Es la hoja de series? Cabecera (en las 5 primeras filas) con fecha, ejercicio, reps y kg. */
export function findSeriesHeader(sheet: Sheet): { headerIdx: number; cols: SeriesCols } | null {
  for (let i = 0; i < Math.min(sheet.rows.length, 5); i++) {
    const cols = seriesColumns(sheet.rows[i] ?? []);
    if (cols.date != null && cols.exercise != null && cols.reps != null && cols.kg != null) return { headerIdx: i, cols };
  }
  return null;
}

/** Series por fecha. Una fila «4 | 6 | 22,5» son 4 series de 6 con 22,5 kg. Las filas con datos no válidos se avisan y se saltan. */
export function parseSeriesSheet(sheet: Sheet, date1904 = false): { byDate: Map<string, HistorySet[]>; issues: Array<{ line: number; message: string }> } {
  const found = findSeriesHeader(sheet);
  const byDate = new Map<string, HistorySet[]>();
  const issues: Array<{ line: number; message: string }> = [];
  if (!found) return { byDate, issues };
  const { headerIdx, cols } = found;
  const cell = (row: string[], i: number | null) => (i == null ? "" : (row[i] ?? "").trim());
  for (let r = headerIdx + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row || row.every((c) => !c?.trim())) continue;
    const line = r + 1;
    const date = parseDateCell(cell(row, cols.date), date1904);
    const exercise = cell(row, cols.exercise).slice(0, 100);
    if (!date || !exercise) {
      issues.push({ line, message: "Hoja Series: falta fecha o ejercicio" });
      continue;
    }
    const n = cols.series == null || !cell(row, cols.series) ? 1 : parseNumber(cell(row, cols.series));
    const reps = parseNumber(cell(row, cols.reps));
    const kg = parseNumber(cell(row, cols.kg));
    if (n == null || !Number.isInteger(n) || n < 1 || n > SERIES_LIMITS.setsPerRow || reps == null || !Number.isInteger(reps) || reps < 0 || reps > 200 || kg == null || kg < 0 || kg > 1000) {
      issues.push({ line, message: `Hoja Series: valores no válidos en «${exercise.slice(0, 30)}»` });
      continue;
    }
    const list = byDate.get(date) ?? [];
    if (list.length + n > SERIES_LIMITS.setsPerDay) {
      issues.push({ line, message: "Hoja Series: demasiadas series ese día" });
      continue;
    }
    const notes = cell(row, cols.notes).slice(0, 500) || null;
    for (let k = 0; k < n; k++) list.push({ exercise, reps, weightKg: kg, notes });
    byDate.set(date, list);
  }
  return { byDate, issues };
}

/** Añade las series a la sesión de su fecha. Con series, una sesión solo de pista pasa a mixta (la pista no guarda series). */
export function attachSets(rows: HistoryRow[], byDate: Map<string, HistorySet[]>): { rows: HistoryRow[]; unmatched: string[] } {
  const used = new Set<string>();
  const out = rows.map((r) => {
    const sets = byDate.get(r.date);
    if (!sets?.length || used.has(r.date)) return r;
    used.add(r.date);
    return { ...r, sets, kind: r.kind === "TRACK" ? ("MIXED" as const) : r.kind };
  });
  return { rows: out, unmatched: [...byDate.keys()].filter((d) => !used.has(d)).sort() };
}

// ---------------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------------

/** Misma fecha, mismo título (sin tildes, mayúsculas ni espacios de más) y misma duración. */
export const dedupeKey = (r: { date: string; title: string | null | undefined; durationSec?: number | null }) =>
  `${r.date}|${norm(r.title ?? "")}|${r.durationSec ?? ""}`;

/** ¿Suma carga? Sin duración y RPE (ni TSS manual) la sesión se guarda, pero no entra en CTL/ATL. */
export const contributesLoad = (r: Pick<HistoryRow, "durationSec" | "rpe" | "manualTss">) => r.manualTss != null || (Boolean(r.durationSec) && Boolean(r.rpe));

// ---------------------------------------------------------------------------
// Plantillas (100 % sintéticas)
// ---------------------------------------------------------------------------

export const TEMPLATE_HEADER = ["Fecha", "Título", "Tipo", "Duración (min)", "Distancia (km)", "RPE", "Carga (TSS)", "Notas"];
export const TEMPLATE_ROWS: Array<Array<string | number>> = [
  ["2026-01-05", "Rodaje suave", "Correr", 45, 8.2, 4, "", "Ritmo cómodo"],
  ["2026-01-06", "Fuerza tren inferior", "Fuerza", 60, "", 7, "", "Ejemplo de sesión de gimnasio"],
  ["2026-01-07", "Natación técnica", "Nadar", 40, 1.5, 5, "", ""],
  ["2026-01-09", "Series 6x400", "Correr", 55, 9, 8, "", "Recuperación de 90 s"],
  ["2026-01-10", "Bici suave", "Bici", 90, 30, 3, "", ""],
];

export const buildTemplateCsv = () => toCsv(TEMPLATE_HEADER, TEMPLATE_ROWS);

export function buildTemplateXlsx(): Uint8Array {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cellXml = (v: string | number, r: number, c: number) => {
    if (v === "") return "";
    const ref = `${colLetter(c)}${r}`;
    return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  };
  const rows = [TEMPLATE_HEADER, ...TEMPLATE_ROWS].map((row, i) => `<row r="${i + 1}">${row.map((v, c) => cellXml(v, i + 1, c)).join("")}</row>`).join("");
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zipSync({
    "[Content_Types].xml": strToU8(
      `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Entrenamientos" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(`${head}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`),
  });
}
