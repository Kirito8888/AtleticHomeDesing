import { parsePatchBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { assignmentSchema } from "@/lib/study/v17-study";
import { deleteAssignment, updateAssignment } from "@/lib/study/v17-service";

type Ctx = RouteContext<"/api/study/assignments/[id]">;

export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await updateAssignment(user.id, id, await parsePatchBody(req, assignmentSchema.partial()));
  return { ok: true };
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteAssignment(user.id, id);
  return { ok: true };
});
