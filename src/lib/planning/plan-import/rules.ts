/** Reglas puras del plan importado (sin BD): versiones, fases, temporada, huellas. */

/**
 * ¿Está activo un día de la versión `dayVariant` si la opción elegida es `choice`?
 * Los días comunes (null) siempre. «A» vale para «A-V», «A-S»…: la opción elegida
 * es una hoja y sus prefijos también están activos.
 */
export function isActiveVariant(dayVariant: string | null, choice: string | null): boolean {
  if (!dayVariant) return true;
  if (!choice) return false;
  return choice === dayVariant || choice.startsWith(`${dayVariant}-`);
}

type Phase = "GENERAL_PREP" | "SPECIFIC_PREP" | "PRE_COMPETITION" | "COMPETITION" | "TAPER" | "DELOAD" | "TRANSITION";

/** Fase del mesociclo a partir de su nombre («Acumulación II», «Realización (taper)»…). */
export function phaseFor(name: string): Phase | null {
  const n = name.toLowerCase();
  if (/taper|realizaci/.test(n)) return "TAPER";
  if (/transici/.test(n)) return "TRANSITION";
  if (/descarga/.test(n)) return "DELOAD";
  if (/intensificaci|precompetitiv|competitiv/.test(n)) return "PRE_COMPETITION";
  if (/transformaci/.test(n)) return "SPECIFIC_PREP";
  if (/acumulaci/.test(n)) return "GENERAL_PREP";
  return null;
}

/** Temporada de atletismo (septiembre → agosto): «Temporada 2026-27». */
export function seasonName(isoStart: string): string {
  const y = Number(isoStart.slice(0, 4));
  const m = Number(isoStart.slice(5, 7));
  const first = m >= 8 ? y : y - 1;
  return `Temporada ${first}-${String((first + 1) % 100).padStart(2, "0")}`;
}

/** JSON con claves ordenadas: jsonb de Postgres no conserva el orden de las claves. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
