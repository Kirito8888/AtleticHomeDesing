import "server-only";

import { routePattern } from "@/lib/admin/server-errors";
import { dateOnly, startOfIsoWeek, today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";

/** v1.8 · Suma una visita a la página (patrón sin ids) en la semana actual. */
export async function recordPageView(userId: string, rawPath: string) {
  if (!rawPath.startsWith("/") || rawPath.startsWith("/api")) return;
  if (!(await getPrefs(userId)).usageStats) return;
  const path = routePattern(rawPath);
  const week = startOfIsoWeek(today());
  await prisma.pageUsage.upsert({ where: { userId_path_week: { userId, path, week } }, create: { userId, path, week, count: 1 }, update: { count: { increment: 1 } } });
}

/** Lo más y lo menos usado en las últimas `weeks` semanas, más las secciones que no abres nunca. */
export async function usageSummary(userId: string, weeks = 8) {
  const from = dateOnly(toIsoDay(startOfIsoWeek(today())));
  from.setUTCDate(from.getUTCDate() - 7 * (weeks - 1));
  const rows = await prisma.pageUsage.groupBy({ by: ["path"], where: { userId, week: { gte: from } }, _sum: { count: true }, orderBy: { _sum: { count: "desc" } } });
  const list = rows.map((r) => ({ path: r.path, count: r._sum.count ?? 0 }));
  const sections = ["/training", "/recovery", "/planning", "/nutrition", "/finance", "/study", "/coach", "/safety", "/glance"];
  const unused = sections.filter((s) => !list.some((r) => r.path === s || r.path.startsWith(`${s}/`)));
  return { top: list.slice(0, 10), total: list.reduce((a, r) => a + r.count, 0), unused, weeks };
}
