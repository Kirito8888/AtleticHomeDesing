import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { healthImportSchema } from "@/lib/recovery/health-sync";
import { ingestHealthDays } from "@/lib/recovery/health-sync-service";

/**
 * Totales diarios de Apple Salud ya calculados en el navegador (export.xml): sueño, FC en reposo, VFC SDNN y peso.
 * Misma regla que el Atajo (v3.1 B): campo vacío → se guarda; igual con tolerancia → se conserva; distinto de lo anotado →
 * NO se pisa y se abre un aviso en /recovery. Idempotente.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("import", user.id);
  const days = await parseBody(req, healthImportSchema);
  const r = await ingestHealthDays(user.id, days);
  return { imported: r.days, saved: r.saved, unchanged: r.unchanged, conflicts: r.conflicts };
});
