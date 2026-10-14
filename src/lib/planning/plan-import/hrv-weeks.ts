import "server-only";

import { prisma } from "@/lib/prisma";

import { isActiveVariant } from "./rules";
import type { ParsedWeek } from "./types";

/** Semanas marcadas «VFC» en los planes activos (solo la versión elegida). Fechas ISO inclusivas. */
export async function hrvWeekRanges(userId: string): Promise<Array<{ start: string; end: string; code: string; number: number | null }>> {
  const mesos = await prisma.planMeso.findMany({ where: { userId, status: "ACTIVE" }, select: { code: true, variant: true, weeks: true } });
  return mesos.flatMap((m) =>
    (m.weeks as unknown as ParsedWeek[])
      .filter((w) => w.hrv && w.start && w.end && isActiveVariant(w.variant, m.variant))
      .map((w) => ({ start: w.start!, end: w.end!, code: m.code, number: w.number })),
  );
}

