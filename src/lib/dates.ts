import { z } from "zod";

// Las columnas @db.Date se manejan como medianoche UTC para que una fecha
// "2026-10-05" nunca se desplace de día por la zona horaria del servidor.

const DAY_MS = 86_400_000;

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Fecha inválida");

export function dateOnly(value: string | Date): Date {
  if (typeof value === "string") return new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((dateOnly(a).getTime() - dateOnly(b).getTime()) / DAY_MS);
}

/** "Hoy" como fecha de calendario en la zona horaria indicada (por defecto Madrid). */
export function today(timeZone = "Europe/Madrid"): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
  return dateOnly(parts);
}

/** Lunes de la semana ISO que contiene `d`. */
export function startOfIsoWeek(d: Date): Date {
  const day = dateOnly(d);
  const dow = (day.getUTCDay() + 6) % 7; // 0 = lunes
  return addDays(day, -dow);
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

export function round(x: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}
