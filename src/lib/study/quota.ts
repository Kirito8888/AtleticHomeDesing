/**
 * Cuota de apuntes por atleta (v2.5 · Estudio B14).
 *
 * Tope fijo de 5 GB. `UPLOAD_QUOTA_MB` puede bajarlo (servidor con poco disco), nunca subirlo:
 * un valor mayor se recorta en lugar de impedir el arranque.
 */
export const STUDY_QUOTA_BYTES = 5 * 1024 ** 3; // 5.368.709.120

export function quotaLimit(envMb: number | undefined): number {
  if (!envMb || !Number.isFinite(envMb) || envMb <= 0) return STUDY_QUOTA_BYTES;
  return Math.min(Math.floor(envMb * 1024 * 1024), STUDY_QUOTA_BYTES);
}

export interface QuotaCheck {
  ok: boolean;
  used: number;
  limit: number;
  /** Lo que queda libre antes de esta subida. */
  remaining: number;
}

/** Permitido mientras lo usado más lo nuevo no pase del límite (llegar justo al límite vale). */
export function checkQuota(used: number, incoming: number, limit: number = STUDY_QUOTA_BYTES): QuotaCheck {
  const u = Math.max(0, used);
  return { ok: u + Math.max(0, incoming) <= limit, used: u, limit, remaining: Math.max(0, limit - u) };
}

/** Porcentaje entero para la barra (0–100). */
export function quotaPercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}
