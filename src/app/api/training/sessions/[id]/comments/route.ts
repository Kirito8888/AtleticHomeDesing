import { z } from "zod";

import { enforceRateLimit, parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { addComment, commentSchema, deleteComment, sessionThread } from "@/lib/training/comments-service";

const q = z.object({ athleteId: z.string().max(40).optional() });

/** Hilo de comentarios de una sesión (atleta o coach con permiso de sesiones: ?athleteId=). */
export const GET = route(async (req, ctx: RouteContext<"/api/training/sessions/[id]/comments">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return sessionThread(user, id, parseQuery(req, q).athleteId);
});

export const POST = route(async (req, ctx: RouteContext<"/api/training/sessions/[id]/comments">) => {
  const user = await requireUser();
  enforceRateLimit("comment", user.id);
  const { id } = await ctx.params;
  const { body } = await parseBody(req, commentSchema);
  return addComment(user, id, parseQuery(req, q).athleteId, body);
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { commentId } = parseQuery(req, z.object({ commentId: z.string().max(40) }));
  await deleteComment(user, commentId);
  return { ok: true };
});
