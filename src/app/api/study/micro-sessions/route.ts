import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listMicroSessions, saveMicroSession } from "@/lib/study/study-history-service";
import { microSessionSchema } from "@/lib/study/study-history";

/**
 * `GET /api/study/micro-sessions` · Sesiones de micro-pasos completadas de la usuaria: `{ sessions }` (más reciente primero, máx. 20).
 * Errores: 401.
 */
export const GET = route(async () => {
  const user = await requireUser();
  return { sessions: await listMicroSessions(user.id) };
});

/**
 * `POST /api/study/micro-sessions` · Guarda una sesión terminada (también la importación desde localStorage). Idempotente por `clientKey`.
 *
 * - Entrada: `{ clientKey, title, steps, stepsDone, focusMin, restMin, completedAt, imported? }`.
 * - Salida: 200 `{ sessions }` con el histórico actualizado.
 * - Errores: 400 · 401 · 403 origen/condiciones.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  return { sessions: await saveMicroSession(user.id, await parseBody(req, microSessionSchema)) };
});
