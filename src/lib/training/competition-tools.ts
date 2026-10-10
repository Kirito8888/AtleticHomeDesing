// v1.7 · Entreno y competición: lanzamientos por implemento y semana, récords por temporada y categoría,
// simulador de los 6 intentos, calentamientos de pruebas combinadas, comparador de sesiones e
// importación de calendarios de competiciones (.ics / CSV). Puro (sin BD).
import { addDays, dateOnly, startOfIsoWeek, toIsoDay } from "@/lib/dates";

// 6 · Lanzamientos por implemento y semana ---------------------------------------------------
export function throwsByImplementWeek(rows: Array<{ date: string; implementWeightG: number | null; throws: number }>) {
  const weeks = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const wk = toIsoDay(startOfIsoWeek(dateOnly(r.date)));
    const imp = r.implementWeightG ? `${r.implementWeightG} g` : "sin peso";
    const m = weeks.get(wk) ?? new Map<string, number>();
    m.set(imp, (m.get(imp) ?? 0) + r.throws);
    weeks.set(wk, m);
  }
  const implements_ = [...new Set(rows.map((r) => (r.implementWeightG ? `${r.implementWeightG} g` : "sin peso")))].sort((a, b) => parseInt(b) - parseInt(a));
  return {
    implements: implements_,
    weeks: [...weeks.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([week, m]) => ({ week, byImplement: Object.fromEntries(m), total: [...m.values()].reduce((x, y) => x + y, 0) })),
  };
}

// 8 · Récords por temporada y categoría (RFEA: la edad que se cumple en el año de la temporada) ---
export function ageCategory(birthDate: string | null, season: number): string | null {
  if (!birthDate) return null;
  const age = season - Number(birthDate.slice(0, 4));
  if (age < 14) return "Sub-14";
  if (age < 16) return "Sub-16";
  if (age < 18) return "Sub-18";
  if (age < 20) return "Sub-20";
  if (age < 23) return "Sub-23";
  if (age < 35) return "Sénior";
  return `Máster M${Math.floor(age / 5) * 5}`;
}

export function seasonRecords(rows: Array<{ date: string; event: string; implementWeightG: number | null; markM: number; isCompetition: boolean }>, birthDate: string | null) {
  const best = new Map<string, { season: number; event: string; implementWeightG: number | null; markM: number; date: string; isCompetition: boolean }>();
  for (const r of rows) {
    const season = Number(r.date.slice(0, 4));
    const k = `${season}|${r.event}|${r.implementWeightG ?? ""}`;
    const cur = best.get(k);
    if (!cur || r.markM > cur.markM) best.set(k, { season, event: r.event, implementWeightG: r.implementWeightG, markM: r.markM, date: r.date, isCompetition: r.isCompetition });
  }
  return [...best.values()].sort((a, b) => b.season - a.season || a.event.localeCompare(b.event) || (b.implementWeightG ?? 0) - (a.implementWeightG ?? 0)).map((r) => ({ ...r, category: ageCategory(birthDate, r.season) }));
}

// 4 · Simulador de competición: cuándo te toca cada intento --------------------------------------
/**
 * Concurso de lanzamientos: `athletes` atletas, tú en el puesto `position`, ~`secondsPerAttempt` por
 * intento (incluida la medición). Tras la 3.ª ronda pasan `finalists` y el orden se invierte por
 * clasificación: como no se sabe tu puesto, se supone que entras y que lanzas a mitad de la mejora.
 */
export function attemptSchedule(o: { athletes: number; position: number; secondsPerAttempt: number; rounds?: number; finalists?: number }) {
  const rounds = o.rounds ?? 6;
  const fin = Math.min(o.finalists ?? 8, o.athletes);
  const out: Array<{ round: number; atMin: number; restMin: number | null }> = [];
  let t = 0;
  for (let r = 1; r <= rounds; r++) {
    const n = r <= 3 ? o.athletes : fin;
    const pos = r <= 3 ? o.position : Math.ceil(fin / 2);
    const at = t + (pos - 1) * o.secondsPerAttempt;
    out.push({ round: r, atMin: Math.round((at / 60) * 10) / 10, restMin: out.length ? Math.round(((at - out[out.length - 1].atMin * 60) / 60) * 10) / 10 : null });
    t += n * o.secondsPerAttempt;
  }
  return { attempts: out, totalMin: Math.round(t / 60) };
}

// 5 · Pruebas combinadas: calentamiento de cada prueba hacia atrás y avisos de solape ---------------
export function combinedWarmups(events: Array<{ name: string; startMin: number; durationMin: number }>, warmupMin: number) {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin);
  return sorted.map((e, i) => {
    const prevEnd = i ? sorted[i - 1].startMin + sorted[i - 1].durationMin : null;
    const warmupStart = e.startMin - warmupMin;
    const gap = prevEnd == null ? null : e.startMin - prevEnd;
    return {
      ...e,
      warmupStart,
      gapMin: gap,
      // Si entre pruebas hay menos que un calentamiento completo, se acorta (activación breve)
      advice: gap == null ? "Calentamiento completo." : gap < 15 ? "Muy poco hueco: solo activación breve (5 min) y mantén el calor." : gap < warmupMin ? `Hueco de ${gap} min: calentamiento corto (${Math.max(5, gap - 5)} min).` : "Hueco suficiente: descansa, come algo y calienta completo.",
    };
  });
}

// 7 · Comparador de dos sesiones ------------------------------------------------------------------
type Cmp = { date: string; title: string | null; type: string; durationSec: number | null; sessionRpe: number | null; tss: number | null; bestMarkM: number | null; validThrows: number; strengthVolumeKg: number };
export function compareSessions(a: Cmp, b: Cmp) {
  const row = (label: string, x: number | null, y: number | null, unit = "", higherIsBetter = true) => ({
    label,
    a: x,
    b: y,
    unit,
    diff: x != null && y != null ? Math.round((y - x) * 100) / 100 : null,
    better: x != null && y != null && x !== y ? ((y > x) === higherIsBetter ? "b" : "a") : null,
  });
  return [
    row("Duración", a.durationSec != null ? Math.round(a.durationSec / 60) : null, b.durationSec != null ? Math.round(b.durationSec / 60) : null, "min", true),
    row("RPE de la sesión", a.sessionRpe, b.sessionRpe, "", false),
    row("Carga (TSS)", a.tss, b.tss, ""),
    row("Mejor marca", a.bestMarkM, b.bestMarkM, "m"),
    row("Lanzamientos válidos", a.validThrows, b.validThrows, ""),
    row("Volumen de fuerza", a.strengthVolumeKg, b.strengthVolumeKg, "kg"),
  ].filter((r) => r.a != null || r.b != null);
}

// 3 · Calendario de competiciones importado -------------------------------------------------------
export type ImportedEvent = { title: string; date: string; location: string | null };

/** .ics (RFC 5545): DTSTART (fecha o fecha-hora), SUMMARY y LOCATION de cada VEVENT; líneas plegadas. */
export function parseIcsEvents(text: string): ImportedEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const out: ImportedEvent[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const get = (k: string) => body.match(new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, "m"))?.[1]?.trim() ?? null;
    const start = get("DTSTART");
    const title = get("SUMMARY");
    if (!start || !title) continue;
    const m = start.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) continue;
    const unescape = (s: string | null) => s?.replace(/\\n/g, " ").replace(/\\([,;\\])/g, "$1") ?? null;
    out.push({ title: unescape(title)!.slice(0, 200), date: `${m[1]}-${m[2]}-${m[3]}`, location: unescape(get("LOCATION"))?.slice(0, 200) ?? null });
  }
  return out;
}

/** CSV «fecha;competición;lugar» (separador ; o , y fecha AAAA-MM-DD o DD/MM/AAAA). Ignora la cabecera. */
export function parseCompetitionCsv(text: string): ImportedEvent[] {
  const out: ImportedEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split(line.includes(";") ? ";" : ",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 2) continue;
    let date: string | null = null;
    const iso = cols[0].match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const es = cols[0].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) date = cols[0];
    else if (es) date = `${es[3]}-${es[2].padStart(2, "0")}-${es[1].padStart(2, "0")}`;
    if (!date || !cols[1]) continue;
    out.push({ title: cols[1].slice(0, 200), date, location: cols[2] ? cols[2].slice(0, 200) : null });
  }
  return out;
}

/** Quita las que ya están (misma fecha y mismo nombre, sin mayúsculas) y las de hace más de un mes. */
export function newCompetitions(found: ImportedEvent[], existing: Array<{ title: string; date: string }>, today: string) {
  const have = new Set(existing.map((e) => `${e.date}|${e.title.trim().toLowerCase()}`));
  const from = toIsoDay(addDays(dateOnly(today), -31));
  const seen = new Set<string>();
  return found.filter((e) => {
    const k = `${e.date}|${e.title.trim().toLowerCase()}`;
    if (have.has(k) || seen.has(k) || e.date < from) return false;
    seen.add(k);
    return true;
  });
}
