import "server-only";

import { auth } from "@/auth";
import type { CoachScope, UserRole } from "@/generated/prisma/enums";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export interface CurrentUser {
  id: string;
  role: UserRole;
}

export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "No autenticado");
  return { id: session.user.id, role: session.user.role };
}

/**
 * Resuelve de qué atleta se leen/escriben datos deportivos.
 * - Sin athleteId (o el propio) → el usuario actual.
 * - Coach/Admin con vínculo ACTIVE → ese atleta, solo para los ámbitos (`scope`)
 *   que el atleta le haya concedido (escritura además exige canPlan).
 * Nunca se usa para finanzas, nutrición ni estudio: esos datos son privados.
 */
export async function resolveAthleteId(
  user: CurrentUser,
  athleteId: string | null | undefined,
  scope: CoachScope,
  mode: "read" | "write" = "read",
): Promise<string> {
  if (!athleteId || athleteId === user.id) return user.id;
  if (user.role === "ADMIN") return athleteId;
  if (user.role !== "COACH") throw new ApiError(403, "Sin permiso sobre este atleta");
  const link = await prisma.coachAthlete.findUnique({
    where: { coachId_athleteId: { coachId: user.id, athleteId } },
  });
  if (!link || link.status !== "ACTIVE") throw new ApiError(403, "Sin vínculo activo con este atleta");
  if (!link.scopes.includes(scope)) throw new ApiError(403, `El atleta no te ha dado acceso a: ${SCOPE_LABEL[scope]}`);
  if (mode === "write" && !link.canPlan) throw new ApiError(403, "El atleta no te ha dado permiso de planificación");
  return athleteId;
}

export const SCOPE_LABEL: Record<CoachScope, string> = {
  LOAD: "carga y marcas",
  SESSIONS: "sesiones",
  RECOVERY: "recuperación y lesiones",
  PLANNING: "planificación",
  REPORTS: "informes del coach IA",
};
