import { z } from "zod";

import { preparePack } from "@/lib/ai/study-pack";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { enqueuePack } from "@/lib/jobs/queue";

const body = z.object({
  topicId: z.string().min(1).max(40),
  /** Otros apuntes de la misma asignatura que se suman a los del tema (p. ej. el PDF y el PPTX del mismo tema). */
  documentIds: z.array(z.string().min(1).max(40)).max(10).optional(),
  /** Descarta lo generado y empieza de cero (si no, solo se rehace lo que falló o falta). */
  force: z.boolean().optional(),
});

/**
 * `POST /api/ai/study/pack` · Lanza en segundo plano la generación del paquete de un tema (resumen por prioridad + banco del juego).
 * Se consulta el avance con `GET /api/ai/study/pack/[topicId]`. Nada se escribe fuera del propio paquete.
 *
 * - Entrada: `{ topicId, documentIds?, force? }`. Salida: 202 `{ status: "PENDING" }`.
 * - Errores: 400 · 401 · 403 origen/condiciones, sin consentimiento de IA o tratamiento limitado · 404 tema no suyo ·
 *   409 sin apuntes procesados o ya generándose · 429 `aiGenerate` (10/h) · 503 IA sin configurar.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  const b = await parseBody(req, body);
  const pack = await preparePack(user.id, b.topicId, { documentIds: b.documentIds, force: b.force });
  await enqueuePack({ userId: user.id, topicId: b.topicId, documentIds: b.documentIds });
  return Response.json({ status: pack.status }, { status: 202 });
});
