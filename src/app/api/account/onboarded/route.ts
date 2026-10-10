import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** v1.8 · Primer uso guiado terminado (o descartado): el panel deja de invitar a hacerlo. */
export const POST = route(async () => {
  const user = await requireUser();
  await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  return { ok: true };
});
