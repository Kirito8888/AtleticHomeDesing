import "server-only";

import { auth } from "@/auth";
import type { UserRole } from "@/generated/prisma/enums";
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
 * - Coach/Admin con vínculo ACTIVE → ese atleta (escritura solo si canPlan).
 * Nunca se usa para finanzas, nutrición ni estudio: esos datos son privados.
 */
export async function resolveAthleteId(
  user: CurrentUser,
  athleteId: string | null | undefined,
  mode: "read" | "write" = "read",
): Promise<string> {
  if (!athleteId || athleteId === user.id) return user.id;
  if (user.role === "ADMIN") return athleteId;
  if (user.role !== "COACH") throw new ApiError(403, "Sin permiso sobre este atleta");
  const link = await prisma.coachAthlete.findUnique({
    where: { coachId_athleteId: { coachId: user.id, athleteId } },
  });
  if (!link || link.status !== "ACTIVE") throw new ApiError(403, "Sin vínculo activo con este atleta");
  if (mode === "write" && !link.canPlan) throw new ApiError(403, "El atleta no te ha dado permiso de planificación");
  return athleteId;
}
