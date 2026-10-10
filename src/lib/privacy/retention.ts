// v1.7 · Plazos de conservación (art. 5.1.e RGPD, limitación del plazo). Puro: qué se borra y cuándo.
// Se pueden cambiar por variables de entorno (RETENTION_*_DAYS); los valores por defecto son prudentes.
export const RETENTION_DEFAULTS = {
  /** Registro de actividad de seguridad (inicios de sesión, cambios…). */
  AUDIT: 180,
  /** Salidas de «Entreno sola» ya terminadas (con nota y ubicación cifradas). */
  SAFETY_TRIPS: 90,
  /** Registro interno de notificaciones enviadas (evita duplicados). */
  NOTIFICATIONS: 60,
  /** Enlaces para compartir (entrenadora, médica, fisio) desde que caducan o se revocan. */
  EXPIRED_LINKS: 30,
  /** Solicitudes de derechos ya atendidas (prueba de que se atendieron). */
  PRIVACY_REQUESTS: 3 * 365,
} as const;
export type RetentionKey = keyof typeof RETENTION_DEFAULTS;

/** Días de cada plazo: variable RETENTION_<CLAVE>_DAYS si es un número válido (mín. 1), si no el valor por defecto. */
export function retentionDays(envVars: Record<string, string | undefined>): Record<RetentionKey, number> {
  return Object.fromEntries(
    (Object.keys(RETENTION_DEFAULTS) as RetentionKey[]).map((k) => {
      const v = Number(envVars[`RETENTION_${k}_DAYS`]);
      return [k, Number.isFinite(v) && v >= 1 ? Math.floor(v) : RETENTION_DEFAULTS[k]];
    }),
  ) as Record<RetentionKey, number>;
}

export const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 864e5);
