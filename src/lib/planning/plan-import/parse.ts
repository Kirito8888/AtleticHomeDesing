import { lineText } from "./extract";
import type { ParsedDay, ParsedMeso, ParsedWeek, PdfLine, PlanBlock, PlanRow, SessionKind, VariantOption } from "./types";

/**
 * Convierte las líneas de un PDF «día a día» en un mesociclo estructurado.
 *
 * Maquetación que se espera (la del plan 2026-27, versión 3 a 22 de cada bloque):
 *  - cabecera de página «M5 · Acumulación II · 26/10 – 22/11/2026» y pie «… · versión 12 · Página N»;
 *  - semanas «SEMANA 1 · 26/10 – 01/11 · título» o «VERSIÓN A · SEMANA 2 · …» (cuerpo ≥ 12 pt);
 *  - días «M5 · S1 · LUNES 26/10 · título · ~109 min (coche) / ~104 (bici)» (10 pt, a veces en dos líneas);
 *  - tablas «Ejercicio | Series × reps | %RM / carga | RIR | Desc. | Cómo lo hago» con celdas en varias líneas;
 *  - párrafos con etiqueta («Calentamiento (10 min): …») y el bloque «Por qué: …».
 * Devuelve null si el PDF no tiene esa cabecera (p. ej. el resumen de la temporada).
 */
export function parsePlanPdf(lines: PdfLine[]): ParsedMeso | null {
  const header = lines.find((l) => l.role === "header" && MESO_RE.test(lineText(l)));
  if (!header) return null;
  const m = MESO_RE.exec(lineText(header))!;
  const endYear = Number(m[8]);
  const end = iso(endYear, Number(m[7]), Number(m[6]));
  const startYear = m[5] ? Number(m[5]) : Number(m[4]) > Number(m[7]) ? endYear - 1 : endYear;
  const start = iso(startYear, Number(m[4]), Number(m[3]));
  const meso: ParsedMeso = {
    code: m[1],
    name: m[2].trim(),
    start,
    end,
    version: versionOf(lines),
    intro: [],
    annexes: [],
    weeks: [],
    days: [],
    variants: [],
    defaultVariant: null,
    warnings: [],
  };
  const dateIn = (dd: number, mm: number) => inferDate(dd, mm, start, end);

  const body = lines.filter((l) => l.role === "body");
  let week: (ParsedWeek & { variantSet: boolean }) | null = null;
  let day: ParsedDay | null = null;
  let table: TableState | null = null;
  let prev: PdfLine | null = null;
  let inAnnex = false;
  const blocks = (): PlanBlock[] | null => day?.blocks ?? null;

  for (let i = 0; i < body.length; i++) {
    const line = body[i];
    const text = lineText(line);
    const gap = prev && prev.page === line.page ? prev.y - line.y : Infinity;

    // Anexos al final del PDF: ya no son parte del último día.
    if (inAnnex) {
      const last = meso.annexes.at(-1);
      // Título de anexo partido en dos líneas.
      if (line.size >= 12 && last?.title && !last.text && prev?.size && prev.size >= 12 && gap <= 26) {
        last.title = `${last.title} ${text}`;
        prev = line;
        continue;
      }
      if (line.size >= 12 || !last || (last.text && gap > PARA_GAP + 4)) meso.annexes.push(line.size >= 12 ? { title: text, text: "" } : labelled(line));
      else last.text = join(last.text, text);
      prev = line;
      continue;
    }

    // Encabezados grandes: semana, o apartado de la introducción.
    if (line.size >= 12) {
      let full = text;
      while (i + 1 < body.length && body[i + 1].size >= 12 && body[i + 1].page === line.page && body[i].y - body[i + 1].y <= 26) {
        full += " " + lineText(body[++i]);
      }
      prev = body[i];
      table = null;
      if (ANNEX_RE.test(full)) {
        inAnnex = true;
        day = null;
        meso.annexes.push({ title: full, text: "" });
        continue;
      }
      const w = WEEK_RE.exec(full);
      if (w) {
        week = {
          variant: w[1] ?? null,
          variantSet: false,
          number: w[2] ? Number(w[2]) : null,
          title: (w[5] ?? "").trim(),
          start: dateFromDdMm(w[3], dateIn),
          end: dateFromDdMm(w[4], dateIn),
          text: "",
        };
        meso.weeks.push(week);
        day = null;
      } else if (!day && !week) {
        meso.intro.push({ title: full, text: "" });
      } else if (day) {
        day.blocks.push({ kind: "text", title: full, text: "" });
      }
      continue;
    }

    // Cabecera de día (puede seguir en la línea siguiente).
    if (line.size >= 9.6 && line.size < 12 && DAY_START.test(text)) {
      let full = text;
      while (
        i + 1 < body.length &&
        Math.abs(body[i + 1].size - line.size) < 0.6 &&
        body[i + 1].page === line.page &&
        body[i].y - body[i + 1].y <= 14 &&
        !DAY_START.test(lineText(body[i + 1]))
      ) {
        full += " " + lineText(body[++i]);
      }
      prev = body[i];
      table = null;
      const parsed = parseDayHeader(full, dateIn);
      if (!parsed) {
        meso.warnings.push(`Cabecera de día no reconocida: «${full.slice(0, 80)}»`);
        continue;
      }
      day = { ...parsed, weekTitle: week?.title || null, blocks: [], key: "" };
      if (week && !week.variantSet) {
        week.variant = parsed.variant;
        week.variantSet = true;
      }
      meso.days.push(day);
      continue;
    }

    const target = blocks();
    if (!target) {
      // Texto antes del primer día: introducción del bloque o explicación de la semana.
      if (week) week.text = join(week.text, text);
      else {
        const last = meso.intro.at(-1);
        if (last && gap <= 16) last.text = join(last.text, text);
        else meso.intro.push(labelled(line));
      }
      prev = line;
      continue;
    }

    // Tabla de ejercicios.
    if (/\bEjercicio\b/.test(text) && /\bSeries\b/.test(text)) {
      const cols = columnsOf(line);
      const last = target.at(-1);
      // Mismo bloque si la tabla sigue tras un salto de página.
      if (last?.kind === "table" && table && line.page !== table.page) table = { cols, rows: last.rows, row: null, page: line.page, continued: true };
      else {
        const rows: PlanRow[] = [];
        target.push({ kind: "table", rows });
        table = { cols, rows, row: null, page: line.page, continued: false };
      }
      prev = line;
      continue;
    }
    if (table && isTableLine(line, table.cols) && !WHY_RE.test(text)) {
      const hasName = line.items.some((it) => colOf(it.x, table!.cols) === "exercise");
      if (!table.row && table.continued && !hasName && table.rows.length) {
        table.row = table.rows.at(-1)!; // fila partida por el salto de página
      } else if (!table.row || (hasName && gap > ROW_GAP)) {
        table.row = { exercise: "", sets: "", load: "", rir: "", rest: "", how: "", ramp: false };
        table.rows.push(table.row);
      }
      table.continued = false;
      for (const it of line.items) {
        const c = colOf(it.x, table.cols);
        // La columna «Desc.» es estrecha y parte palabras sin guion («A dem» + «anda»).
        const glue = c === "rest" && /\p{Ll}$/u.test(table.row[c]) && /^\p{Ll}/u.test(it.str.trim());
        table.row[c] = glue ? table.row[c] + it.str.trim() : join(table.row[c], it.str);
      }
      table.row.ramp = RAMP_RE.test(table.row.exercise);
      prev = line;
      continue;
    }
    table = null;

    const last = target.at(-1);
    if (WHY_RE.test(text)) target.push({ kind: "why", text: text.replace(WHY_RE, "").trim() });
    else if (last && last.kind !== "table" && gap <= PARA_GAP) last.text = join(last.text, text);
    else target.push({ kind: "text", ...labelled(line) });
    prev = line;
  }

  finalize(meso);
  return meso;
}

// ---------------------------------------------------------------------------

const WEEKDAYS = "LUNES|MARTES|MIÉRCOLES|MIERCOLES|JUEVES|VIERNES|SÁBADO|SABADO|DOMINGO";
const MESO_RE = /^(M\d{1,2})\s*·\s*(.*?)\s*·\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[–-]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/;
const WEEK_RE = /^(?:VERSIÓN\s+([A-Z])\s*·\s*)?(?:SEMANA\s+(\d+)\s*·\s*)?(\d{1,2}\/\d{1,2})\s*[–-]\s*(\d{1,2}\/\d{1,2})\s*(?:·\s*([\s\S]*))?$/;
const DAY_START = /^M\d{1,2}\s+·\s+\S/;
const DAY_DATE_RE = new RegExp(`^(${WEEKDAYS})\\s+(\\d{1,2})\\/(\\d{1,2})`);
const DAY_REL_RE = /^D(?:\s*[−-]\s*(\d+))?$/;
// «S1», «A», «A·S2-V», «B·S1», «C·D−5», «S2·A», «S1·sáb»
const CODE_RE = /^(?:([A-Z])(?:·|$))?(?:S(\d+)(?:-([A-Z]))?(?:·([A-Za-zÁÉÍÓÚáéíóú]{1,5}))?|D(?:\s*[−-]\s*(\d+))?)?$/;
const WHY_RE = /^Por qué:\s*/;
const ANNEX_RE = /^Anexo\s+[A-Z0-9]+\b/;
const RAMP_RE = /^\W*Rampa\b/;
const DURATION_RE = /~\s*(\d+)\s*min/;
const COMPETITION_RE = /\b(CAMPEONATO|EUROPEO|GRAN PREMIO|GP|LIGA|COPA|AUTON[ÓO]MICO|CLUBES|MEETING|TROFEO|ABSOLUTO|CONTROL FEDERADO)\b/;
/** Distancia entre filas de tabla (≈ 13-14 pt) frente a líneas de una misma celda (≈ 10 pt). */
const ROW_GAP = 11.8;
const PARA_GAP = 12.5;

type Col = "exercise" | "sets" | "load" | "rir" | "rest" | "how";
type TableState = { cols: Array<{ col: Col; x: number }>; rows: PlanRow[]; row: PlanRow | null; page: number; continued: boolean };

const COL_LABELS: Array<[RegExp, Col]> = [
  [/^Ejercicio/, "exercise"],
  [/^Series/, "sets"],
  [/RM|carga/i, "load"],
  [/^RIR/, "rir"],
  [/^Desc/, "rest"],
  [/^Cómo|^Como/, "how"],
];

function columnsOf(line: PdfLine): TableState["cols"] {
  const cols: TableState["cols"] = [];
  for (const it of line.items) {
    const hit = COL_LABELS.find(([re, col]) => re.test(it.str.trim()) && !cols.some((c) => c.col === col));
    if (hit) cols.push({ col: hit[1], x: it.x });
  }
  if (!cols.some((c) => c.col === "exercise")) cols.unshift({ col: "exercise", x: line.items[0].x });
  return cols.sort((a, b) => a.x - b.x);
}

function colOf(x: number, cols: TableState["cols"]): Col {
  let c: Col = cols[0].col;
  for (const col of cols) if (x >= col.x - 2) c = col.col;
  return c;
}

/** Fila de tabla: empieza justo en la columna «Ejercicio» o en una columna posterior (celda que sigue). */
function isTableLine(line: PdfLine, cols: TableState["cols"]): boolean {
  const x = line.items[0].x;
  return line.size < 9.5 && (Math.abs(x - cols[0].x) <= 1.5 || (cols.length > 1 && x >= cols[1].x - 2));
}

function labelled(line: PdfLine): { title: string | null; text: string } {
  const first = line.items[0].str.trim();
  if (first.endsWith(":") && first.length <= 80 && line.items.length > 1) {
    return { title: first.slice(0, -1).trim(), text: lineText({ ...line, items: line.items.slice(1) }) };
  }
  if (first.endsWith(":") && line.items.length === 1) return { title: first.slice(0, -1).trim(), text: "" };
  return { title: null, text: lineText(line) };
}

function join(a: string, b: string): string {
  const t = b.replace(/\s+/g, " ").trim();
  if (!a) return t;
  if (!t) return a;
  return `${a} ${t}`;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** El año de «26/10» es el que cae dentro del bloque (con margen de una semana). */
export function inferDate(dd: number, mm: number, start: string, end: string): string | null {
  const s = Date.parse(start) - 8 * 864e5;
  const e = Date.parse(end) + 8 * 864e5;
  const y0 = Number(end.slice(0, 4));
  for (const y of [y0, y0 - 1, y0 + 1]) {
    const candidate = iso(y, mm, dd);
    const t = Date.parse(candidate);
    const real = new Date(t);
    if (Number.isNaN(t) || real.getUTCDate() !== dd || real.getUTCMonth() + 1 !== mm) continue;
    if (t >= s && t <= e) return candidate;
  }
  return null;
}

function dateFromDdMm(s: string, dateIn: (dd: number, mm: number) => string | null) {
  const [dd, mm] = s.split("/").map(Number);
  return dateIn(dd, mm);
}

function versionOf(lines: PdfLine[]): string | null {
  for (const l of lines) {
    if (l.role !== "footer") continue;
    const v = /versión\s+(\d+)/i.exec(lineText(l));
    if (v) return v[1];
  }
  return null;
}

type DayHeader = Omit<ParsedDay, "key" | "blocks" | "weekTitle">;

export function parseDayHeader(text: string, dateIn: (dd: number, mm: number) => string | null): DayHeader | null {
  const parts = text.split(/\s+·\s+/).map((p) => p.trim());
  if (parts.length < 3) return null;
  const [mesoCode, code, when, ...rest] = parts;
  const c = CODE_RE.exec(code);
  if (!c) return null;
  let date: string | null = null;
  let weekday: string | null = null;
  let relDay: number | null = null;
  const dm = DAY_DATE_RE.exec(when);
  if (dm) {
    weekday = dm[1];
    date = dateIn(Number(dm[2]), Number(dm[3]));
    if (!date) return null;
  } else {
    const rel = DAY_REL_RE.exec(when);
    if (!rel) return null;
    relDay = rel[1] ? -Number(rel[1]) : 0;
  }
  const sub = c[3] ?? c[4];
  const variant = c[1] ? (sub ? `${c[1]}-${sub}` : c[1]) : (sub ?? null);
  const durationPart = rest.find((p) => DURATION_RE.test(p));
  const durationMin = durationPart ? Number(DURATION_RE.exec(durationPart)![1]) : null;
  const titleParts = rest.filter((p) => p !== durationPart);
  const title = (titleParts.join(" · ") || "Sesión").replace(/\s+/g, " ").trim();
  const competition = COMPETITION_RE.test(title);
  return {
    meso: mesoCode,
    variant,
    week: c[2] ? Number(c[2]) : null,
    code,
    date,
    relDay,
    weekday,
    title,
    durationMin,
    competition,
    type: sessionKind(title, competition),
  };
}

export function sessionKind(title: string, competition: boolean): SessionKind {
  if (competition) return "TECHNICAL";
  const jav = /jabalina|lanzamiento|pelota/i.test(title);
  const gym = /sentadilla|ol[íi]mpico|snatch|clean|unilateral|tren (superior|inferior)|contraste|gimnasio|press|tir[óo]n|peso muerto|copenhagen|fuerza/i.test(title);
  const track = /esprint|aceleraci|piscina|bici|carrera|trote|vallas|rodaje/i.test(title);
  if (jav) return gym || track ? "MIXED" : "TECHNICAL";
  if (gym) return track ? "MIXED" : "STRENGTH";
  if (track) return "TRACK";
  return "MIXED";
}

/** Claves, ramas por defecto, opciones de versión y avisos de cobertura. */
function finalize(meso: ParsedMeso) {
  const variantDays = meso.days.filter((d) => d.variant);
  const mains = new Set(variantDays.map((d) => d.variant!.split("-")[0]));
  const commonDays = meso.days.filter((d) => !d.variant);

  // Rama alternativa (p. ej. «Si me clasifico», C): los días comunes de las semanas
  // que sustituye pasan a ser la opción por defecto «N».
  if (mains.size === 1 && commonDays.length) {
    const branch = [...mains][0];
    const introText = meso.intro.map((p) => `${p.title ?? ""} ${p.text}`).join(" ");
    const r = /\bS(\d+)\s*[-–]\s*S(\d+)\s+cambian/i.exec(introText);
    const weeks = r
      ? [Number(r[1]), Number(r[2])]
      : [1, Math.max(1, ...variantDays.filter((d) => d.variant === branch && d.week).map((d) => d.week!))];
    for (const d of commonDays) if (d.week != null && d.week >= weeks[0] && d.week <= weeks[1]) d.variant = "N";
    for (const w of meso.weeks) if (!w.variant && w.number != null && w.number >= weeks[0] && w.number <= weeks[1]) w.variant = "N";
  }

  const codes = [...new Set(meso.days.map((d) => d.variant).filter((v): v is string => !!v))];
  const leaves = codes.filter((c) => !codes.some((o) => o !== c && o.startsWith(`${c}-`)));
  meso.variants = leaves.map((code): VariantOption => ({ code, label: variantLabel(meso, code) }));
  // «VERSIÓN A/B»: por defecto la B (la que no depende de clasificarse). Rama «Si me
  // clasifico»: el plan normal. Día de competición sin confirmar: el primero del PDF.
  const versioned = meso.weeks.some((w) => w.title && /^[A-Z]/.test(w.variant ?? "") && leaves.includes("B"));
  meso.defaultVariant = leaves.length ? ((versioned ? "B" : null) ?? leaves.find((c) => c === "N") ?? leaves[0]) : null;

  // Clave estable: meso|variante|fecha (o D-n)|orden dentro del mismo día.
  const seen = new Map<string, number>();
  for (const d of meso.days) {
    const base = `${meso.code}|${d.variant ?? "-"}|${d.date ?? `D${d.relDay}`}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    d.key = `${base}|${n}`;
  }

  // Cobertura: cada semana del bloque debe tener algún día.
  for (let t = Date.parse(meso.start); t <= Date.parse(meso.end); t += 7 * 864e5) {
    const from = new Date(t).toISOString().slice(0, 10);
    const to = new Date(t + 6 * 864e5).toISOString().slice(0, 10);
    if (!meso.days.some((d) => d.date && d.date >= from && d.date <= to)) meso.warnings.push(`${meso.code}: la semana del ${from} no tiene días.`);
  }
  for (const d of meso.days) {
    const tables = d.blocks.filter((b) => b.kind === "table");
    const rows = tables.flatMap((b) => (b.kind === "table" ? b.rows : []));
    if (!tables.length && !d.competition && !/piscina|descanso|bici|libre|viaje/i.test(d.title)) {
      meso.warnings.push(`${meso.code} · ${d.code} · ${d.weekday ?? `D${d.relDay}`} ${d.date ?? ""}: sin tabla de ejercicios.`);
    }
    const noSets = rows.filter((r) => !r.ramp && !r.sets).length;
    if (noSets) meso.warnings.push(`${meso.code} · ${d.code} · ${d.date ?? `D${d.relDay}`}: ${noSets} fila(s) sin series.`);
  }
}

function variantLabel(meso: ParsedMeso, code: string): string {
  if (code === "N") return "Plan normal (no me clasifico)";
  const [main, sub] = code.split("-");
  if (main === "C" && meso.intro.some((p) => /si me clasifico/i.test(`${p.title} ${p.text}`))) return "Si me clasifico";
  const week = meso.weeks.find((w) => w.variant === code) ?? meso.weeks.find((w) => w.variant === main);
  const title = week?.title.replace(/\s+/g, " ").trim();
  if (!week) {
    // Variante sin «VERSIÓN»: el día en que compito (p. ej. «S2·A», «S1·sáb»).
    const comp = meso.days.find((d) => d.variant === code && d.competition);
    const days = meso.days.filter((d) => d.variant === code);
    return comp
      ? `Compito el ${comp.weekday?.toLowerCase()} ${comp.date?.slice(8, 10)}/${comp.date?.slice(5, 7)}`
      : `Opción ${code} (${days.length} días: ${days.map((d) => d.weekday?.slice(0, 3).toLowerCase()).join(", ")})`;
  }
  const base = `Versión ${main}`;
  if (sub) return title ? `${base} · ${title}` : `${base} · ${sub}`;
  return title ? `${base} · ${title}` : base;
}
