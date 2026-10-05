import { route } from "@/lib/api";
import { requireUser, resolveAthleteId } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** Marcas personales, de la más reciente a la más antigua. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const userId = await resolveAthleteId(user, req.nextUrl.searchParams.get("athleteId"));
  return prisma.personalRecord.findMany({
    where: { userId },
    orderBy: { achievedOn: "desc" },
    include: { exercise: { select: { name: true } } },
  });
});
