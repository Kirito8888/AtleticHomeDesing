import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listSelfTests, saveSelfTests } from "@/lib/study/study-history-service";
import { selfTestBatchSchema } from "@/lib/study/study-history";

/**
 * `GET /api/study/self-test-history/[moduleId]` · Intentos de autoevaluación de la usuaria en esa asignatura: `{ attempts }` (más reciente primero, máx. 20).
 * Errores: 401 · 404 asignatura no suya (o de otra usuaria: misma respuesta).
 */
export const GET = route(async (_req, ctx: RouteContext<"/api/study/self-test-history/[moduleId]">) => {
  const user = await requireUser();
  const { moduleId } = await ctx.params;
  return { attempts: await listSelfTests(user.id, moduleId) };
});

/**
 * `POST /api/study/self-test-history/[moduleId]` · Guarda 1–10 intentos (también la importación desde localStorage). Idempotente por `takenAt`.
 *
 * - Entrada: `{ attempts: [{ takenAt, score, label, questions?, weak, answers?, imported? }] }`.
 * - Salida: 200 `{ attempts }` con el histórico actualizado.
 * - Errores: 400 · 401 · 403 origen/condiciones · 404 asignatura no suya.
 */
export const POST = route(async (req, ctx: RouteContext<"/api/study/self-test-history/[moduleId]">) => {
  const user = await requireUser();
  const { moduleId } = await ctx.params;
  const { attempts } = await parseBody(req, selfTestBatchSchema);
  return { attempts: await saveSelfTests(user.id, moduleId, attempts) };
});
