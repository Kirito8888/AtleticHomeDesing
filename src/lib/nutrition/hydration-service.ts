import "server-only";

import { z } from "zod";

import { dateOnly, isoDate, today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";
import { todayMaxTemp } from "@/lib/weather";

import { waterTarget } from "./hydration";

export const waterSchema = z.object({ date: isoDate, ml: z.number().int().min(50).max(3000) });

export async function addWater(userId: string, input: z.infer<typeof waterSchema>) {
  return prisma.hydrationLog.create({ data: { userId, date: dateOnly(input.date), ml: input.ml }, select: { id: true } });
}

/** Deshace la última anotación del día. */
export async function undoWater(userId: string, date: string) {
  const last = await prisma.hydrationLog.findFirst({ where: { userId, date: dateOnly(date) }, orderBy: { createdAt: "desc" } });
  if (last) await prisma.hydrationLog.delete({ where: { id: last.id } });
}

export async function hydrationDay(userId: string, day: string) {
  const date = dateOnly(day);
  const [sum, prefs, profile, sessions] = await Promise.all([
    prisma.hydrationLog.aggregate({ where: { userId, date }, _sum: { ml: true } }),
    getPrefs(userId),
    prisma.athleteProfile.findUnique({ where: { userId }, select: { bodyWeightKg: true } }),
    prisma.trainingSession.count({ where: { userId, date, status: { in: ["COMPLETED", "PLANNED"] } } }),
  ]);
  const maxTemp = prefs.track && day === toIsoDay(today()) && process.env.LIFEOS_NO_WEATHER !== "1" ? await todayMaxTemp(prefs.track.lat, prefs.track.lon, day) : null;
  const t = waterTarget(prefs, profile?.bodyWeightKg ?? null, sessions > 0, maxTemp);
  return { ml: sum._sum.ml ?? 0, target: t.ml, hot: t.hot, hasSession: t.hasSession, maxTemp };
}
