import "server-only";

import { prisma } from "@/lib/prisma";

/** Lo necesario para precargar <SessionForm>. */
export const formSessionInclude = {
  track: { include: { intervals: { orderBy: { order: "asc" } } } },
  technical: { include: { attempts: { orderBy: { order: "asc" } } } },
  strength: { include: { sets: { orderBy: { order: "asc" } } } },
} as const;

export function exerciseOptions(userId: string) {
  return prisma.exercise.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, bodyweightFactor: true },
  });
}
