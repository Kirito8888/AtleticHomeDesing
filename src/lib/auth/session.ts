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

export interface Grant {
  scopes: CoachScope[];
  canPlan: boolean;
}

/** Une los permisos de varias vías (vínculo 1:1 y clubes): un ámbito vale si alguna vía lo da; escribir, si alguna deja planificar. */
export function mergeGrants(grants: Grant[]): Grant {
  return { scopes: [...new Set(grants.flatMap((g) => g.scopes))], canPlan: grants.some((g) => g.canPlan) };
}

/**
 * Resuelve de qué atleta se leen/escriben datos deportivos.
 * - Sin athleteId (o el propio) → el usuario actual.
 * - Coach/Admin con vínculo ACTIVE (1:1 o por pertenencia a un club, v2.0) → ese atleta, solo para los
 *   ámbitos (`scope`) que el atleta le haya concedido (escritura además exige canPlan).
 *   En un club, el acceso lo da la membresía ACTIVE de la atleta (aceptada por ella) con staff ADMIN/COACH activo.
 * - La limitación del tratamiento (art. 18 RGPD) bloquea siempre, sea cual sea la vía.
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
  const [link, memberships] = await Promise.all([
    prisma.coachAthlete.findUnique({ where: { coachId_athleteId: { coachId: user.id, athleteId } } }),
    prisma.orgMember.findMany({
      where: {
        userId: athleteId,
        role: "ATHLETE",
        status: "ACTIVE",
        org: { members: { some: { userId: user.id, role: { in: ["ADMIN", "COACH"] }, status: "ACTIVE" } } },
      },
      select: { scopes: true, canPlan: true },
    }),
  ]);
  const grants: Grant[] = [...(link?.status === "ACTIVE" ? [link] : []), ...memberships];
  if (!grants.length) throw new ApiError(403, "Sin vínculo activo con este atleta");
  // v1.7 · Limitación del tratamiento (art. 18): el entrenador deja de ver nada mientras dure
  const athlete = await prisma.user.findUnique({ where: { id: athleteId }, select: { processingRestrictedAt: true } });
  if (athlete?.processingRestrictedAt) throw new ApiError(403, "El atleta ha limitado el tratamiento de sus datos");
  const grant = mergeGrants(grants);
  if (!grant.scopes.includes(scope)) throw new ApiError(403, `El atleta no te ha dado acceso a: ${SCOPE_LABEL[scope]}`);
  if (mode === "write" && !grant.canPlan) throw new ApiError(403, "El atleta no te ha dado permiso de planificación");
  return athleteId;
}

export const SCOPE_LABEL: Record<CoachScope, string> = {
  LOAD: "carga y marcas",
  SESSIONS: "sesiones",
  RECOVERY: "recuperación y lesiones",
  PLANNING: "planificación",
  REPORTS: "informes del coach IA",
};
