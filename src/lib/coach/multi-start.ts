import { addDays, dateOnly, toIsoDay } from "@/lib/dates";

const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** 0 = lunes … 6 = domingo. */
const weekday = (iso: string) => (dateOnly(iso).getUTCDay() + 6) % 7;

/**
 * Inicio por defecto de «Planificar varios atletas»: hoy si es lunes; si no, el lunes siguiente.
 * Las semanas tipo y los planes se copian por semanas de lunes a domingo y descartan los días anteriores al inicio:
 * con «hoy» en sábado o domingo la copia salía vacía.
 */
export function defaultMultiStart(todayIso: string): string {
  const dow = weekday(todayIso);
  return dow === 0 ? todayIso.slice(0, 10) : toIsoDay(addDays(dateOnly(todayIso), 7 - dow));
}

/** Días de la primera semana (de lunes a domingo) que quedan antes del inicio y no se copian. */
export function daysLeftOut(startIso: string): { count: number; label: string } {
  const names = DAY_NAMES.slice(0, weekday(startIso));
  const label = names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}` : (names[0] ?? "");
  return { count: names.length, label };
}
