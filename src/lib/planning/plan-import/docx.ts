import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

import type { ParsedDay, ParsedMeso, ParsedWeek, PlanBlock, PlanRow } from "./types";

/**
 * Lector de planes en Word (.docx) para el formato «Mesociclo … · N semanas»: cabecera con Inicio/Final, tablas
 * «SEMANA n | bloque | CARGA · dd/mm-dd/mm», una cabecera «LUNES dd/mm · Día A · …» por sesión seguida de su tabla
 * de ejercicios (Ejercicio · Series · Reps · RIR · Desc. · Tempo) y secciones de texto al principio y al final.
 * Solo lee la estructura (no ejecuta nada del fichero). **La cabecera «Nombre:» y «Entrenador:» NO se importa**: la ficha
 * usa su alias (nunca el nombre real); el lector solo avisa de que el documento lo llevaba.
 */

export const DOCX_LIMITS = { xmlBytes: 12 * 1024 * 1024, blocks: 4000 } as const;

export type DocBlock = { t: "p"; text: string } | { t: "tbl"; rows: string[][] };
type X = { [k: string]: unknown };

const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: true, parseTagValue: false, trimValues: false, processEntities: true });

/** Texto de un nodo (runs `w:t`, tabulaciones y saltos como espacio). */
function textOf(nodes: X[]): string {
  let s = "";
  for (const n of nodes) {
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@") continue;
      if (k === "#text") s += String(v);
      else if (k === "w:tab" || k === "w:br") s += " ";
      else if (Array.isArray(v)) s += textOf(v as X[]);
    }
  }
  return s;
}
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const childArr = (n: X, tag: string): X[] | null => (Array.isArray(n[tag]) ? (n[tag] as X[]) : null);

function tableRows(tbl: X[]): string[][] {
  const rows: string[][] = [];
  for (const tr of tbl) {
    const cells = childArr(tr, "w:tr");
    if (!cells) continue;
    const row: string[] = [];
    for (const tc of cells) {
      const content = childArr(tc, "w:tc");
      if (!content) continue;
      row.push(clean(content.flatMap((p) => (childArr(p, "w:p") ? [textOf(childArr(p, "w:p")!)] : [])).join(" ")));
    }
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

/** Párrafos y tablas del cuerpo, en orden. Devuelve [] si no es un .docx legible. */
export function docxBlocks(bytes: Uint8Array): DocBlock[] {
  let xml: string;
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" && f.originalSize <= DOCX_LIMITS.xmlBytes });
    const doc = files["word/document.xml"];
    if (!doc) return [];
    xml = new TextDecoder("utf-8").decode(doc);
  } catch {
    return [];
  }
  const root = parser.parse(xml) as X[];
  const document = root.map((n) => childArr(n, "w:document")).find(Boolean);
  const body = document?.map((n) => childArr(n, "w:body")).find(Boolean);
  if (!body) return [];
  const out: DocBlock[] = [];
  for (const n of body) {
    if (out.length >= DOCX_LIMITS.blocks) break;
    const p = childArr(n, "w:p");
    if (p) {
      const text = clean(textOf(p));
      if (text) out.push({ t: "p", text });
      continue;
    }
    const tbl = childArr(n, "w:tbl");
    if (tbl) {
      const rows = tableRows(tbl);
      if (rows.length) out.push({ t: "tbl", rows });
    }
  }
  return out;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const validDay = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
/** dd/mm sin año → fecha ISO en el año de `start` o el siguiente (el plan nunca dura más de un año). */
function dmToIso(d: number, m: number, start: { y: number; m: number; d: number }): string | null {
  const y = m < start.m || (m === start.m && d < start.d) ? start.y + 1 : start.y;
  return validDay(y, m, d) ? iso(y, m, d) : null;
}

const DAY_RE = /^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d{1,2})\/(\d{1,2})\s*[·\-–]\s*(.+)$/i;
const WEEKDAY: Record<string, string> = { lunes: "Lunes", martes: "Martes", miercoles: "Miércoles", jueves: "Jueves", viernes: "Viernes", sabado: "Sábado", domingo: "Domingo" };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const META_RE = /^(nombre|entrenador|entrenadora|inicio|final|d[ií]as)\s*:/i;

const flat = (rows: string[][]) => rows.map((r) => r.filter(Boolean).join(" · ")).filter(Boolean);

/** Secciones de texto: un párrafo corto sin punto final abre sección; el resto, y las tablas, se añaden a su texto. */
function sections(blocks: DocBlock[]): Array<{ title: string | null; text: string }> {
  const out: Array<{ title: string | null; text: string }> = [];
  const add = (line: string) => {
    if (!out.length) out.push({ title: null, text: "" });
    const cur = out[out.length - 1];
    cur.text = (cur.text ? `${cur.text}\n` : "") + line;
  };
  for (const b of blocks) {
    if (b.t === "p") {
      if (META_RE.test(b.text)) continue;
      if (b.text.length <= 70 && !/[.:]$/.test(b.text)) out.push({ title: b.text, text: "" });
      else add(b.text);
    } else for (const l of flat(b.rows.filter((r) => !META_RE.test(r[0] ?? "")))) add(l); // la cabecera Nombre/Entrenador/Inicio… no se importa
  }
  return out.filter((s) => s.text).slice(0, 40).map((s) => ({ title: s.title, text: s.text.slice(0, 8000) }));
}

function exerciseRows(rows: string[][]): PlanRow[] | null {
  const head = rows[0]?.map((c) => norm(c)) ?? [];
  if (!head[0]?.startsWith("ejercicio") || !head.some((h) => h.startsWith("series"))) return null;
  const col = (re: RegExp) => head.findIndex((h) => re.test(h));
  const iS = col(/^series/), iR = col(/^reps/), iRir = col(/^rir$/), iD = col(/^desc/), iT = col(/^tempo/);
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const dash = (s: string) => (/^[—–-]$/.test(s) ? "" : s);
  return rows.slice(1).flatMap((r): PlanRow[] => {
    const exercise = cell(r, 0);
    if (!exercise) return [];
    const tempo = dash(cell(r, iT));
    return [{ exercise, sets: dash(cell(r, iS)), load: dash(cell(r, iR)), rir: dash(cell(r, iRir)), rest: dash(cell(r, iD)), how: tempo ? `Tempo ${tempo} (bajada – pausa abajo – subida – pausa arriba, en segundos)` : "", ramp: false }];
  });
}

/** Lee el .docx y devuelve el mesociclo (null si no tiene la cabecera «Inicio: … dd/mm/aaaa» o ninguna sesión). */
export function parsePlanDocx(bytes: Uint8Array): ParsedMeso | null {
  return parseDocBlocks(docxBlocks(bytes));
}

export function parseDocBlocks(blocks: DocBlock[]): ParsedMeso | null {
  if (!blocks.length) return null;
  const lines = blocks.flatMap((b) => (b.t === "p" ? [b.text] : b.rows.map((r) => r.join(" "))));
  const startM = lines.map((l) => /Inicio:?\s*(?:[A-Za-zÁÉÍÓÚáéíóú]+\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(l)).find(Boolean);
  if (!startM) return null;
  const start = { d: Number(startM[1]), m: Number(startM[2]), y: Number(startM[3]) };
  if (!validDay(start.y, start.m, start.d)) return null;
  const startIso = iso(start.y, start.m, start.d);
  const endM = lines.map((l) => /Final:?\s*.*?(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(l)).find(Boolean);
  // «unos 75 min» o un rango «unos 60-65 min» (se usa el valor alto: es el tiempo a reservar)
  const durM = lines.map((l) => /unos\s+(\d{2,3})(?:\s*[-–]\s*(\d{2,3}))?\s*min/i.exec(l)).find(Boolean);
  const durationMin = durM ? Math.max(Number(durM[1]), Number(durM[2] ?? 0)) : null;
  const nameInDoc = lines.some((l) => /^Nombre:?\s+\S/i.test(l));

  const titleLine = blocks.flatMap((b) => (b.t === "p" ? [b.text] : [])).find((t) => /^Mesociclo\s+\d+/i.test(t) || /mesociclo\s+\d+\s*·/i.test(t)) ?? "";
  const num = /Mesociclo\s+(\d+)/i.exec(titleLine)?.[1];
  const code = num ? `M${num}` : "DOCX";
  const subtitle = blocks.flatMap((b) => (b.t === "p" ? [b.text] : [])).find((t) => /^Mesociclo\s+\d+\s*·/i.test(t));
  const name = (subtitle ?? titleLine ?? "Plan importado").slice(0, 120) || "Plan importado";

  const weeks: ParsedWeek[] = [];
  const days: ParsedDay[] = [];
  const warnings: string[] = [];
  let weekNo: number | null = null;
  let weekTitle: string | null = null;
  let firstPlanIdx = -1;
  let lastEnd = -1;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === "tbl" && b.rows.length === 1 && /^semana\s+(\d+)$/i.test(b.rows[0][0] ?? "")) {
      if (firstPlanIdx < 0) firstPlanIdx = i;
      weekNo = Number(/(\d+)/.exec(b.rows[0][0])![1]);
      const cells = b.rows[0];
      weekTitle = clean(cells.slice(1).join(" · ")) || `Semana ${weekNo}`;
      const per = /(\d{1,2})\/(\d{1,2})\s*[-–]\s*(\d{1,2})\/(\d{1,2})/.exec(cells.at(-1) ?? "");
      const next = blocks[i + 1];
      weeks.push({
        variant: null,
        number: weekNo,
        title: weekTitle,
        start: per ? dmToIso(Number(per[1]), Number(per[2]), start) : null,
        end: per ? dmToIso(Number(per[3]), Number(per[4]), start) : null,
        text: next?.t === "p" && !DAY_RE.test(next.text) ? next.text : "",
      });
      lastEnd = i;
      continue;
    }
    if (b.t !== "p") continue;
    const m = DAY_RE.exec(b.text);
    if (!m) continue;
    if (firstPlanIdx < 0) firstPlanIdx = i;
    const date = dmToIso(Number(m[2]), Number(m[3]), start);
    const title = clean(m[4]);
    const table = blocks[i + 1]?.t === "tbl" ? (blocks[i + 1] as { t: "tbl"; rows: string[][] }) : null;
    lastEnd = table ? i + 1 : i;
    if (!date) {
      warnings.push(`Fecha no válida en «${b.text.slice(0, 40)}»: se omite.`);
      continue;
    }
    if (/descanso/i.test(title)) continue;
    const rows = table ? exerciseRows(table.rows) : null;
    const dayBlocks: PlanBlock[] = rows?.length
      ? [{ kind: "table", rows }]
      : table
        ? [{ kind: "text", title: null, text: flat(table.rows).join("\n") }]
        : [];
    if (!dayBlocks.length) {
      warnings.push(`«${b.text.slice(0, 40)}» no trae ejercicios: se omite.`);
      continue;
    }
    days.push({
      key: "",
      meso: code,
      variant: null,
      week: weekNo,
      code: weekNo ? `S${weekNo}` : "S",
      date,
      relDay: null,
      weekday: WEEKDAY[norm(m[1])] ?? null,
      title: title.slice(0, 160),
      durationMin,
      competition: false,
      type: "STRENGTH",
      weekTitle,
      blocks: dayBlocks,
    });
  }
  if (!days.length) return null;

  const seen = new Map<string, number>();
  for (const d of days) {
    const base = `${code}|-|${d.date}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    d.key = `${base}|${n}`;
  }
  days.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.key.localeCompare(b.key));

  const intro = sections(blocks.slice(0, Math.max(0, firstPlanIdx)).filter((b, i) => !(b.t === "p" && i < 3 && /^PLAN DE ENTRENAMIENTO$/i.test(b.text))));
  const annexes = sections(blocks.slice(lastEnd + 1).filter((b) => !(b.t === "p" && /^Cómo llego/i.test(b.text))));
  const endIso = endM && validDay(Number(endM[3]), Number(endM[2]), Number(endM[1])) ? iso(Number(endM[3]), Number(endM[2]), Number(endM[1])) : days.at(-1)!.date!;
  if (nameInDoc) warnings.push("El documento lleva un nombre en la cabecera: no se importa (la ficha usa su alias).");
  return { code, name, start: startIso, end: endIso < days.at(-1)!.date! ? days.at(-1)!.date! : endIso, version: null, intro, annexes, weeks, days, variants: [], defaultVariant: null, warnings };
}
