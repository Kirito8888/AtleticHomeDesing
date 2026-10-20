import "server-only";

import { currentSession } from "@/lib/auth/current";
import type { CoachScope, UserRole } from "@/generated/prisma/enums";
import { ApiError } from "@/lib/api";
import { TERMS_VERSION } from "@/lib/auth/constants";
import { prisma } from "@/lib/prisma";
import { isMutation, requestContext, termsExempt } from "@/lib/request-context";

export interface CurrentUser {
  id: string;
  role: UserRole;
}

export async function requireUser(): Promise<CurrentUser> {
  const session = await currentSession();
  if (!session?.user?.id) throw new ApiError(401, "No autenticado");
  // Las escrituras exigen las condiciones vigentes aceptadas, no solo el layout (que no cubre /api)
  const rc = requestContext.getStore();
  if (rc && isMutation(rc.method) && !termsExempt(rc.path)) {
    rc.termsOk ??= await termsAccepted(session.user.id);
    if (!rc.termsOk) throw new ApiError(403, "Acepta las condiciones de uso para continuar", { code: "terms_required" });
  }
  return { id: session.user.id, role: session.user.role };
}

async function termsAccepted(userId: string) {
  const last = await prisma.consent.findFirst({ where: { userId, purpose: "TERMS" }, orderBy: { createdAt: "desc" }, select: { version: true, granted: true } });
  return Boolean(last?.granted && last.version === TERMS_VERSION);
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
 * - Coach/Admin (el ADMIN global no se salta nada) con vínculo ACTIVE (1:1 o por pertenencia a un club, v2.0) → ese atleta, solo para los
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
  // El ADMIN global no es un acceso libre a datos deportivos: pasa por el mismo vínculo, ámbito y art. 18 que una entrenadora.
  if (user.role !== "COACH" && user.role !== "ADMIN") throw new ApiError(403, "Sin permiso sobre este atleta");
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

/**
 * `resolveAthleteId` para muchas atletas a la vez (panel del club): mismas reglas (vínculo 1:1 ACTIVE + membresías ACTIVE de club con
 * staff ADMIN/COACH activo, art. 18 bloqueante, ADMIN global sin atajos) en 3 consultas, sea cual sea el número de atletas.
 * Devuelve los ámbitos de lectura de cada una; las que no aparecen o salen vacías no se pueden leer.
 */
export async function readableScopes(user: CurrentUser, athleteIds: string[]): Promise<Map<string, Set<CoachScope>>> {
  const out = new Map<string, Set<CoachScope>>();
  const others = athleteIds.filter((id) => id !== user.id);
  if (athleteIds.includes(user.id)) out.set(user.id, new Set(Object.keys(SCOPE_LABEL) as CoachScope[]));
  if ((user.role !== "COACH" && user.role !== "ADMIN") || !others.length) return out;
  const [links, memberships, restricted] = await Promise.all([
    prisma.coachAthlete.findMany({ where: { coachId: user.id, athleteId: { in: others }, status: "ACTIVE" }, select: { athleteId: true, scopes: true, canPlan: true } }),
    prisma.orgMember.findMany({
      where: {
        userId: { in: others },
        role: "ATHLETE",
        status: "ACTIVE",
        org: { members: { some: { userId: user.id, role: { in: ["ADMIN", "COACH"] }, status: "ACTIVE" } } },
      },
      select: { userId: true, scopes: true, canPlan: true },
    }),
    prisma.user.findMany({ where: { id: { in: others }, processingRestrictedAt: { not: null } }, select: { id: true } }),
  ]);
  const blocked = new Set(restricted.map((r) => r.id));
  const grants = new Map<string, Grant[]>();
  for (const l of links) grants.set(l.athleteId, [...(grants.get(l.athleteId) ?? []), l]);
  for (const m of memberships) grants.set(m.userId, [...(grants.get(m.userId) ?? []), m]);
  for (const [id, g] of grants) if (!blocked.has(id)) out.set(id, new Set(mergeGrants(g).scopes));
  return out;
}

export const SCOPE_LABEL: Record<CoachScope, string> = {
  LOAD: "carga y marcas",
  SESSIONS: "sesiones",
  RECOVERY: "recuperación y lesiones",
  PLANNING: "planificación",
  REPORTS: "informes del coach IA",
};
