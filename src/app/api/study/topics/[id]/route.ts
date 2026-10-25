import { parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteTopic, topicPatchSchema, updateTopic } from "@/lib/study/modules-service";

export const PATCH = route(async (req, ctx: RouteContext<"/api/study/topics/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return updateTopic(user.id, id, await parsePatchBody(req, topicPatchSchema));
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/study/topics/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteTopic(user.id, id);
  return { ok: true };
});
