import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { addTopic } from "@/lib/study/modules-service";
import { topicSchema } from "@/lib/study/study-route";

export const POST = route(async (req, ctx: RouteContext<"/api/study/modules/[id]/topics">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return addTopic(user.id, id, await parseBody(req, topicSchema));
});
