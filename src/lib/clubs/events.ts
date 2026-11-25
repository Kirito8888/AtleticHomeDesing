// v3.2 P · Eventos del club y asistencia (sí/no/quizá). Puro: sin BD.
import { z } from "zod";

import { madridWallToUtc } from "@/lib/integrations/apple-units";

import { parseAmount } from "./fees";

export const RSVP_ANSWERS = ["YES", "NO", "MAYBE"] as const;
export type Rsvp = (typeof RSVP_ANSWERS)[number];
export const RSVP_LABEL: Record<Rsvp, string> = { YES: "Sí", NO: "No", MAYBE: "Quizá" };

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** «AAAA-MM-DDTHH:mm» (hora de Madrid, como la escribe una persona) → instante UTC; null si no es una fecha real. */
export function madridWallToInstant(raw: string): Date | null {
  const m = WALL.exec(raw);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  return madridWallToUtc(wall);
}

const startsAt = z.string().refine((v) => madridWallToInstant(v) !== null, "Fecha y hora no válidas");
export const eventCreateSchema = z.object({
  title: z.string().trim().min(1, "Falta el título").max(80),
  startsAt,
  location: z.string().trim().max(120).optional(),
  /** En euros, como lo escribe una persona («10,50»); vacío = sin cuota. */
  amount: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || parseAmount(v) !== null, "Importe no válido"),
});
export type EventCreate = z.infer<typeof eventCreateSchema>;

export const eventUpdateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  startsAt: startsAt.optional(),
  location: z.string().trim().max(120).nullable().optional(),
});

export const rsvpSchema = z.object({ answer: z.enum(RSVP_ANSWERS) });

export interface AttendanceMember {
  id: string;
  name: string;
}

/** Resumen para el staff: recuentos y nombres por respuesta; `none` = miembros activos sin responder. */
export function attendanceSummary(responses: Array<{ memberId: string; answer: Rsvp }>, members: AttendanceMember[]) {
  const answerOf = new Map(responses.map((r) => [r.memberId, r.answer]));
  const names: Record<Rsvp | "NONE", string[]> = { YES: [], NO: [], MAYBE: [], NONE: [] };
  for (const m of members) names[answerOf.get(m.id) ?? "NONE"].push(m.name);
  return { yes: names.YES.length, no: names.NO.length, maybe: names.MAYBE.length, none: names.NONE.length, names };
}
