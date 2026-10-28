import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { createModule, listModules } from "@/lib/study/modules-service";
import { moduleSchema } from "@/lib/study/study-route";

/**
 * `GET /api/study/modules` · Asignaturas de la usuaria con su fecha de examen y los días que quedan (según el día de hoy).
 *
 * - Salida: 200 lista de asignaturas.
 * - Errores: 401 sin sesión.
 * - Aislamiento: solo las suyas (`userId` de la sesión); el estudio es privado y no tiene ámbito de entrenadora.
 */
export const GET = route(async () => {
  const user = await requireUser();
  return listModules(user.id, toIsoDay(today()));
});

/**
 * `POST /api/study/modules` · Crea una asignatura.
 *
 * - Entrada: JSON `moduleSchema` (`name` 1–80, `examDate` AAAA-MM-DD opcional, `prepMode` opcional).
 * - Salida: 200 la asignatura creada.
 * - Errores: 400 datos no válidos · 401 · 403 origen/condiciones · 409 ya existe una con ese nombre.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  return createModule(user.id, await parseBody(req, moduleSchema));
});
