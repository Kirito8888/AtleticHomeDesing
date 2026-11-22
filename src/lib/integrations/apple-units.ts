import { z } from "zod";

import { localDay } from "@/lib/dates";

/**
 * v3.1 · Bloque C · Unidades, números e instantes que llegan de Atajos de iOS. Puro (sin BD).
 * Solo se convierten unidades EXPLÍCITAS (texto con unidad o campo con sufijo): un número desnudo se toma en la unidad del campo.
 * Adivinar la unidad por la magnitud guardaría datos falsos en silencio.
 */

export type Kind = "kcal" | "m" | "km" | "min" | "s" | "bpm" | "ms" | "kg";

/** Magnitudes enteras: ahí «1.234» es miles. En km, kg o min el punto es decimal. */
const INTEGER_KINDS = new Set<Kind>(["kcal", "m", "s", "bpm", "ms"]);

/** «7,2», «1.234,5», «1 234», «1.234» (miles solo en enteras). null si no es un número. */
export function parseLocaleNumber(raw: string, kind: Kind): number | null {
  const s = raw.replace(/[\s  ]/g, "");
  if (!/^[+-]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let t: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    t = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0) {
    t = s.split(",").length > 2 ? s.split(",").join("") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    const parts = s.split(".");
    const thousands = parts.length > 2 || (INTEGER_KINDS.has(kind) && /^\d{1,3}$/.test(parts[0].replace(/^[+-]/, "")) && parts[1].length === 3);
    t = thousands ? parts.join("") : s;
  } else t = s;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type UnitTable = Record<string, number>;

/** Factor a la unidad canónica de cada magnitud. */
const UNITS: Record<Kind, UnitTable> = {
  kcal: { kcal: 1, cal: 1, kilocalorias: 1, kj: 1 / 4.184, kilojulios: 1 / 4.184, kilojoules: 1 / 4.184 },
  m: { m: 1, metros: 1, metro: 1, km: 1000, kilometros: 1000, kilometro: 1000, mi: 1609.344, mile: 1609.344, miles: 1609.344, millas: 1609.344 },
  km: { km: 1, kilometros: 1, kilometro: 1, m: 0.001, metros: 0.001, metro: 0.001, mi: 1.609344, mile: 1.609344, miles: 1.609344, millas: 1.609344 },
  min: { min: 1, mins: 1, minutos: 1, minutes: 1, s: 1 / 60, seg: 1 / 60, segundos: 1 / 60, sec: 1 / 60, h: 60, hr: 60, hrs: 60, horas: 60, hours: 60 },
  s: { s: 1, seg: 1, segundos: 1, sec: 1, min: 60, mins: 60, minutos: 60, minutes: 60, h: 3600, hr: 3600, hrs: 3600, horas: 3600, hours: 3600 },
  bpm: { lpm: 1, bpm: 1, "count/min": 1, "latidos/min": 1, "latidos/minuto": 1 },
  ms: { ms: 1, s: 1000 },
  kg: { kg: 1, kilos: 1, g: 0.001, gramos: 0.001, lb: 0.45359237, lbs: 0.45359237, libras: 0.45359237 },
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const DURATION_KINDS = new Set<Kind>(["min", "s"]);

/** «1:05:00», «45:12» (m:s), «1 h 5 min», «7h32m». Devuelve segundos o null. */
function parseDurationText(text: string): number | null {
  const t = norm(text);
  const clock = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (clock) return clock[3] != null ? +clock[1] * 3600 + +clock[2] * 60 + +clock[3] : +clock[1] * 60 + +clock[2];
  const re = /(\d+(?:[.,]\d+)?)\s*(horas?|hours?|hrs?|h|minutos?|minutes?|mins?|min|m|segundos?|seconds?|seg|sec|s)\b/g;
  let total = 0;
  let found = false;
  let rest = t;
  for (const m of t.matchAll(re)) {
    const v = Number(m[1].replace(",", "."));
    const u = m[2][0];
    total += u === "h" ? v * 3600 : u === "s" ? v : v * 60;
    found = true;
    rest = rest.replace(m[0], "");
  }
  return found && rest.replace(/[\s,y]/g, "") === "" ? total : null;
}

/** Convierte un valor a la unidad canónica de `kind`. Devuelve un número o un mensaje de error (string). */
export function convertQuantity(v: unknown, kind: Kind): number | string | null | undefined {
  if (v == null || v === "") return undefined;
  if (typeof v === "number") return v;
  if (typeof v !== "string") return "Valor no válido";
  const text = v.trim();
  if (!text) return undefined;
  if (DURATION_KINDS.has(kind)) {
    const sec = parseDurationText(text);
    if (sec != null) return kind === "s" ? sec : sec / 60;
  }
  const m = /^([+-]?[\d.,\s  ]*\d)\s*([^\d\s].*)?$/.exec(text);
  if (!m) return `No entiendo «${text.slice(0, 30)}»`;
  const unit = m[2] ? norm(m[2]).replace(/\.$/, "") : null;
  const factor = unit == null ? 1 : UNITS[kind][unit];
  if (factor == null) return `Unidad «${m[2]!.slice(0, 15)}» no válida aquí (se espera ${kind})`;
  // Con unidad explícita de la misma familia que el número («7,2 km»), los puntos son decimales salvo magnitud entera clara
  const n = parseLocaleNumber(m[1], unit != null && unit !== kind && !INTEGER_KINDS.has(kind) ? "km" : kind);
  return n == null ? `No entiendo «${text.slice(0, 30)}»` : Math.round(n * factor * 1e6) / 1e6;
}

/** Preprocesador zod: número o texto con unidad → número canónico; vacío → undefined. */
export function quantity(kind: Kind, min: number, max: number) {
  return z
    .unknown()
    .transform((v, ctx) => {
      const r = convertQuantity(v, kind);
      if (typeof r === "string") {
        ctx.addIssue({ code: "custom", message: r });
        return z.NEVER;
      }
      return r;
    })
    .pipe(z.number().finite().min(min).max(max).nullish())
    .optional();
}

/** Un número desnudo (o texto solo numérico) se interpreta en `unit`: «sleepHours: 7.4» son horas aunque el campo se normalice a minutos. */
export const withBareUnit = (unit: string) => (v: unknown) =>
  typeof v === "number" ? `${v} ${unit}` : typeof v === "string" && /^[\s\d.,\u00a0]+$/.test(v) && v.trim() !== "" ? `${v.trim()} ${unit}` : v;

/**
 * ISO con desfase, ISO sin desfase (= hora de pared en Madrid) o «AAAA-MM-DD HH:mm:ss ±hhmm» (Atajos/Apple Salud).
 * null si no se entiende.
 */
export function parseAppleInstant(raw: string): Date | null {
  const s = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, mi, se = "00", off] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +h > 23 || +mi > 59 || +se > 59) return null;
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  if (Number.isNaN(wall) || new Date(wall).getUTCDate() !== +d) return null;
  if (off) {
    if (off.toUpperCase() === "Z") return new Date(wall);
    const sign = off[0] === "-" ? -1 : 1;
    const digits = off.slice(1).replace(":", "");
    const mins = +digits.slice(0, 2) * 60 + (digits.length > 2 ? +digits.slice(2, 4) : 0);
    return new Date(wall - sign * mins * 60_000);
  }
  return madridWallToUtc(wall);
}

/** Desfase (ms) de Madrid respecto a UTC en un instante. */
function madridOffsetMs(utc: number): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utc));
  const g = (t: string) => +p.find((x) => x.type === t)!.value;
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(utc / 1000) * 1000;
}

/** Hora de pared de Madrid → instante UTC. Hueco de primavera: se adelanta; hora repetida de otoño: la primera. */
export function madridWallToUtc(wallAsUtcMs: number): Date {
  // Dos candidatos: con el desfase de verano y con el de invierno; se elige el primero que reproduce la hora de pared.
  const candidates = [wallAsUtcMs - 2 * 3600_000, wallAsUtcMs - 3600_000];
  for (const c of candidates) if (c + madridOffsetMs(c) === wallAsUtcMs) return new Date(c);
  // Hueco de primavera (la hora no existe): se adelanta con el desfase de invierno
  return new Date(wallAsUtcMs - 3600_000);
}

export const madridDay = (d: Date) => localDay(d);
