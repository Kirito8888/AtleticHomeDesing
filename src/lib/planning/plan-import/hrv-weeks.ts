import "server-only";

import { prisma } from "@/lib/prisma";

import { isActiveVariant } from "./rules";
import type { ParsedWeek } from "./types";

type HrvRange = { start: string; end: string; code: string; number: number | null };

/** Semanas marcadas «VFC» en los planes activos de varias personas, en una consulta (solo la versión elegida). */
export async function hrvWeekRangesMany(userIds: string[]): Promise<Map<string, HrvRange[]>> {
  const mesos = await prisma.planMeso.findMany({ where: { userId: { in: userIds }, status: "ACTIVE" }, select: { userId: true, code: true, variant: true, weeks: true } });
  const out = new Map<string, HrvRange[]>(userIds.map((id) => [id, []]));
  for (const m of mesos) {
    const ranges = (m.weeks as unknown as ParsedWeek[])
      .filter((w) => w.hrv && w.start && w.end && isActiveVariant(w.variant, m.variant))
      .map((w) => ({ start: w.start!, end: w.end!, code: m.code, number: w.number }));
    out.get(m.userId)!.push(...ranges);
  }
  return out;
}

/** Semanas marcadas «VFC» en los planes activos (solo la versión elegida). Fechas ISO inclusivas. */
export async function hrvWeekRanges(userId: string): Promise<HrvRange[]> {
  return (await hrvWeekRangesMany([userId])).get(userId)!;
}
