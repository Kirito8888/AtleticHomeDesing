import { z } from "zod";

import { askStudyQuestion } from "@/lib/ai/rag";
import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

const schema = z.object({
  question: z.string().trim().min(2).max(4000),
  threadId: z.string().optional(),
  /** Limitar la búsqueda a ciertos documentos (p.ej. una asignatura). */
  documentIds: z.array(z.string()).max(50).optional(),
});

/** Pregunta sobre los apuntes (RAG). Devuelve la respuesta con citas [n]. */
export const POST = route(async (req) => {
  const user = await requireUser();
  return askStudyQuestion(user.id, await parseBody(req, schema));
});
