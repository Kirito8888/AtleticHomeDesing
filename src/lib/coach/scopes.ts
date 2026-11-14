import type { CoachScope } from "@/generated/prisma/enums";

/**
 * Ámbitos con los que nace un vínculo con entrenadora o club. `RECOVERY` (recuperación, readiness y lesiones)
 * es salud (art. 9 RGPD): nunca viene marcado; la atleta lo activa expresamente y queda el consentimiento `COACH_RECOVERY`.
 * La BD conserva un default antiguo con RECOVERY: por eso el código pasa siempre estos ámbitos explícitos.
 */
export const DEFAULT_SHARED_SCOPES: CoachScope[] = ["LOAD", "SESSIONS", "PLANNING", "REPORTS"];
