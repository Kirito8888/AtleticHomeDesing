// v1.10 · Horario de la universidad desde su .ics (RFC 5545). Puro (se usa en el navegador y en tests).
import { fromMin } from "@/lib/study/schedule";

export type ImportedSlot =
  | { kind: "CLASS"; subject: string; weekday: number; start: string; end: string; validFrom?: string; validTo?: string; location?: string }
  | { kind: "EXAM"; subject: string; date: string; start: string; end: string; location?: string };

const DAYS: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const EXAM = /\b(examen|exam|parcial|final|recuperaci[oó]n|prueba de evaluaci[oó]n)\b/i;

/** Fecha y minuto del día en hora de Madrid. «Z» = UTC; con TZID o sin zona, la hora tal cual. */
function when(value: string, isUtc: boolean): { date: string; min: number } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
  if (!m) return null;
  if (isUtc && m[4]) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, min: m[4] ? Number(m[4]) * 60 + Number(m[5]) : 0 };
}
const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/**
 * Clases semanales (RRULE FREQ=WEEKLY, o el mismo evento repetido cada semana) y exámenes (eventos
 * sueltos cuyo título dice examen/parcial/final). Lo demás (eventos sueltos) se cuenta como ignorado.
 */
export function parseIcsSchedule(text: string): { slots: ImportedSlot[]; ignored: number } {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const singles: Array<{ subject: string; date: string; start: number; end: number; location?: string }> = [];
  const slots: ImportedSlot[] = [];
  let ignored = 0;
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const body = block.split("END:VEVENT")[0];
    const prop = (k: string) => {
      const m = body.match(new RegExp(`^${k}((?:;[^:\\n]*)?):(.*)$`, "m"));
      return m ? { params: m[1], value: m[2].trim() } : null;
    };
    const unescape = (s?: string) => s?.replace(/\\n/g, " ").replace(/\\([,;\\])/g, "$1").trim();
    const summary = unescape(prop("SUMMARY")?.value)?.slice(0, 80);
    const ds = prop("DTSTART");
    const de = prop("DTEND");
    if (!summary || !ds || !/T\d{4}/.test(ds.value)) {
      ignored++;
      continue; // sin hora (día entero) no es una clase
    }
    const s = when(ds.value, ds.value.endsWith("Z"));
    const e = de ? when(de.value, de.value.endsWith("Z")) : null;
    if (!s) continue;
    const end = e && e.date === s.date ? e.min : s.min + 60;
    const location = unescape(prop("LOCATION")?.value)?.slice(0, 80) || undefined;
    const rrule = prop("RRULE")?.value ?? "";
    if (/FREQ=WEEKLY/.test(rrule)) {
      const byday = rrule.match(/BYDAY=([A-Z,]+)/)?.[1]?.split(",").map((d) => DAYS[d.slice(-2)]).filter((d) => d != null) ?? [weekday(s.date)];
      const until = rrule.match(/UNTIL=(\d{8})/)?.[1];
      const count = Number(rrule.match(/COUNT=(\d+)/)?.[1] ?? 0);
      const validTo = until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : count ? addDays(s.date, Math.ceil(count / byday.length) * 7 - 1) : undefined;
      for (const wd of byday) slots.push({ kind: "CLASS", subject: summary, weekday: wd, start: fromMin(s.min), end: fromMin(end), validFrom: s.date, validTo, location });
    } else if (EXAM.test(summary)) {
      slots.push({ kind: "EXAM", subject: summary, date: s.date, start: fromMin(s.min), end: fromMin(end), location });
    } else singles.push({ subject: summary, date: s.date, start: s.min, end, location });
  }
  // Muchas universidades exportan cada sesión por separado: mismo título, día de la semana y hora → una clase semanal
  const groups = new Map<string, typeof singles>();
  for (const x of singles) {
    const k = `${x.subject}|${weekday(x.date)}|${x.start}|${x.end}`;
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  for (const g of groups.values()) {
    if (g.length < 2) {
      ignored += g.length;
      continue;
    }
    const dates = g.map((x) => x.date).sort();
    slots.push({ kind: "CLASS", subject: g[0].subject, weekday: weekday(dates[0]), start: fromMin(g[0].start), end: fromMin(g[0].end), validFrom: dates[0], validTo: dates.at(-1), location: g[0].location });
  }
  return { slots, ignored };
}
