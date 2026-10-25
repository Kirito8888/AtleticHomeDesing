import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assignDocument } from "@/lib/study/modules-service";

/** Mete un apunte en la asignatura. */
export const POST = route(async (req, ctx: RouteContext<"/api/study/modules/[id]/documents">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { documentId } = await parseBody(req, z.object({ documentId: z.string().min(1) }));
  await assignDocument(user.id, documentId, id);
  return { ok: true };
});

/** Saca un apunte de la asignatura (el apunte se conserva). */
export const DELETE = route(async (req, ctx: RouteContext<"/api/study/modules/[id]/documents">) => {
  const user = await requireUser();
  await ctx.params;
  const { documentId } = await parseBody(req, z.object({ documentId: z.string().min(1) }));
  await assignDocument(user.id, documentId, null);
  return { ok: true };
});
