// Suplementos y citas (v1.6). Puro.
import { z } from "zod";

import { isoDate } from "@/lib/dates";

export const supplementSchema = z.object({
  name: z.string().trim().min(1).max(80),
  brand: z.string().trim().max(80).nullish(),
  batch: z.string().trim().max(60).nullish(),
  dose: z.string().trim().max(80).nullish(),
  startedOn: isoDate.nullish(),
  endedOn: isoDate.nullish(),
  notes: z.string().trim().max(300).nullish(),
});
export const supplementPatchSchema = z
  .object({ checkedOn: isoDate.nullable(), endedOn: isoDate.nullable(), notes: z.string().trim().max(300).nullable(), days: z.array(z.number().int().min(1).max(7)).max(7) })
  .partial();

export const appointmentSchema = z.object({
  kind: z.enum(["PHYSIO", "DOCTOR", "OTHER"]),
  at: z.iso.datetime({ offset: true }),
  place: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});
export const APPOINTMENT_LABEL = { PHYSIO: "Fisio", DOCTOR: "Médico/a", OTHER: "Otra" } as const;

/**
 * Antes de competir: suplementos activos sin comprobar en la lista oficial en los últimos `days` días.
 * Atlenza no dice si algo está permitido: solo recuerda comprobarlo.
 */
export function supplementsToCheck(
  list: Array<{ id: string; name: string; endedOn: string | null; checkedOn: string | null }>,
  today: string,
  days = 90,
) {
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10);
  return list.filter((s) => (!s.endedOn || s.endedOn >= today) && (!s.checkedOn || s.checkedOn < limit));
}
