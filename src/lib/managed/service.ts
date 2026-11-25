import "server-only";

import { randomUUID } from "node:crypto";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ageOk, managedCreateSchema, managedEmail, type ManagedCreate } from "./rules";

/**
 * Filtro que EXCLUYE las fichas gestionadas (atletas sin cuenta). Toda consulta que recorre «usuarias» (cron, push, Telegram,
 * informes, estadísticas de admin, cuentas demo, rotación de claves…) debe llevarlo: `src/test/architecture.test.ts` lo vigila.
 */
export const notManaged = { managedById: null } satisfies Prisma.UserWhereInput;

/** Una cuenta gestionada nunca inicia sesión, ni se le emite un restablecimiento de contraseña, ni se resuelve como sesión. */
export async function isManagedUser(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { managedById: true } });
  return Boolean(u?.managedById);
}

/**
 * Da de alta una ficha: `User` sin contraseña ni acceso (email marcador no enrutable) + `ManagedAthlete`.
 * Solo COACH/ADMIN; el 2FA de staff ya lo exige `requireUser`.
 */
export async function createManagedAthlete(coach: { id: string; role: string }, raw: unknown, now = new Date()) {
  if (coach.role !== "COACH" && coach.role !== "ADMIN") throw new ApiError(403, "Solo una entrenadora puede crear fichas");
  const parsed = managedCreateSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Datos no válidos");
  const v: ManagedCreate = parsed.data;
  if (!ageOk(v.birthYear, now.getUTCFullYear())) throw new ApiError(400, "La edad mínima es 14 años");
  return prisma.$transaction(async (tx) => {
    // El id se fija aquí para que el email marcador (único) se derive de él sin una segunda escritura
    const id = randomUUID();
    const user = await tx.user.create({ data: { id, email: managedEmail(id), name: v.alias, role: "ATHLETE", managedById: coach.id } });
    return tx.managedAthlete.create({
      data: {
        userId: user.id,
        coachId: coach.id,
        alias: v.alias,
        birthYear: v.birthYear ?? null,
        category: v.category ?? null,
        discipline: v.discipline ?? null,
        group: v.group ?? null,
        notes: v.notes ?? null,
        consentAt: now,
      },
    });
  });
}
