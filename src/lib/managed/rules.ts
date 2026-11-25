import { z } from "zod";

import type { CoachScope } from "@/generated/prisma/enums";

/**
 * Suite de entrenadora (v3.3 E1): reglas puras de las fichas gestionadas (atletas sin cuenta).
 * Una ficha guarda SOLO alias, año de nacimiento o categoría, disciplina, grupo y notas: nunca nombre real, email,
 * teléfono ni salud (art. 9). El alias es seudonimización, no anonimización: la entrenadora sigue siendo responsable.
 */

/** Dominio reservado (RFC 2606): no enruta correo nunca, así que ninguna vía de recuperación puede llegar a nadie. */
export const MANAGED_EMAIL_DOMAIN = "fichas.invalid";

/** Edad mínima (igual que las cuentas). Con solo el año de nacimiento se exige haber cumplido 14 en cualquier fecha del año. */
export const MIN_AGE = 14;

export const managedEmail = (userId: string) => `ficha-${userId.toLowerCase()}@${MANAGED_EMAIL_DOMAIN}`;
export const isManagedEmail = (email: string) => email.trim().toLowerCase().endsWith(`@${MANAGED_EMAIL_DOMAIN}`);

/** Primer año de nacimiento admitido para `year` (aunque cumpla años en diciembre ya tiene MIN_AGE). */
export const latestBirthYear = (year: number) => year - (MIN_AGE + 1);

const text = (max: number) => z.string().trim().min(1).max(max);

export const MANAGED_NOTICE = "No escribas el nombre real ni datos de contacto, tampoco en las notas.";

export const managedCreateSchema = z
  .object({
    alias: text(40),
    birthYear: z.number().int().min(1900).max(2100).optional(),
    category: text(40).optional(),
    discipline: text(60).optional(),
    group: text(40).optional(),
    notes: z.string().trim().max(2000).optional(),
    /** «Tengo su conformidad» (obligatoria; sin fecha ni documento: la fecha la pone el servidor). */
    consent: z.literal(true, { message: "Confirma que tienes su conformidad" }),
  })
  .strict()
  .refine((v) => v.birthYear !== undefined || v.category !== undefined, { message: "Indica el año de nacimiento o la categoría", path: ["birthYear"] });

export type ManagedCreate = z.infer<typeof managedCreateSchema>;

/** Valida la edad mínima con el año de nacimiento (la categoría sola no permite comprobarla: la entrenadora responde de ella). */
export function ageOk(birthYear: number | undefined, year: number): boolean {
  return birthYear === undefined || birthYear <= latestBirthYear(year);
}

/**
 * Permiso implícito de la entrenadora sobre sus fichas (E2). La ficha no concede nada ella misma (no tiene cuenta): la dueña ve y
 * planifica lo deportivo. **Nunca RECOVERY** (salud, art. 9: las fichas no la tienen). Una ficha archivada es solo lectura.
 */
export const MANAGED_SCOPES: CoachScope[] = ["LOAD", "SESSIONS", "PLANNING", "REPORTS"];
export const managedGrant = (archivedAt: Date | null | undefined): { scopes: CoachScope[]; canPlan: boolean } => ({ scopes: [...MANAGED_SCOPES], canPlan: !archivedAt });
