import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getProgress, putProgress, resetProgress } from "@/lib/study/quest-progress-service";

/**
 * `GET /api/study/quest-progress/[moduleId]` · Progreso del Modo Juego de la usuaria en esa asignatura:
 * `{ state, version }` (`state: null` y `version: 0` si aún no hay nada guardado).
 * Errores: 401 · 404 asignatura no suya (o de otra usuaria: misma respuesta).
 */
export const GET = route(async (_req, ctx: RouteContext<"/api/study/quest-progress/[moduleId]">) => {
  const user = await requireUser();
  const { moduleId } = await ctx.params;
  return getProgress(user.id, moduleId);
});

const putBody = z.object({ state: z.unknown(), baseVersion: z.number().int().min(0).max(1_000_000) });

/**
 * `PUT /api/study/quest-progress/[moduleId]` · Guarda el progreso (estado saneado en el servidor) con control de versión.
 *
 * - Entrada: `{ state, baseVersion }` (`baseVersion` = la que devolvió la última lectura o guardado; 0 si no había).
 * - Salida: 200 `{ state, version }`.
 * - Errores: 400 · 401 · 403 origen/condiciones · 404 asignatura no suya · 409 otro dispositivo guardó antes: `details` trae el
 *   `{ state, version }` actual para unirlo con el local y reintentar.
 */
export const PUT = route(async (req, ctx: RouteContext<"/api/study/quest-progress/[moduleId]">) => {
  const user = await requireUser();
  const { moduleId } = await ctx.params;
  return putProgress(user.id, moduleId, await parseBody(req, putBody));
});

/**
 * `DELETE /api/study/quest-progress/[moduleId]` · «Reiniciar partida»: vacía el progreso (0 XP, sin estrellas, solo el nivel 1 abierto)
 * sin control de versión y sube la versión, así los demás dispositivos sincronizados adoptan la partida vacía al abrir.
 *
 * - Salida: 200 `{ state, version }`.
 * - Errores: 401 · 403 origen/condiciones · 404 asignatura no suya.
 */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/study/quest-progress/[moduleId]">) => {
  const user = await requireUser();
  const { moduleId } = await ctx.params;
  return resetProgress(user.id, moduleId);
});
