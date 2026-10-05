import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const GET = route(async () => {
  const user = await requireUser();
  return prisma.chatThread.findMany({
    where: { userId: user.id, kind: "STUDY" },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true, _count: { select: { messages: true } } },
  });
});
