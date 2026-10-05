import { ApiError, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

type Ctx = RouteContext<"/api/ai/study/threads/[id]">;

export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const thread = await prisma.chatThread.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!thread) throw new ApiError(404, "Conversación no encontrada");
  return thread;
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { count } = await prisma.chatThread.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "Conversación no encontrada");
  return { ok: true };
});
