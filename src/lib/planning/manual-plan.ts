import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { addDays, dateOnly, isoDate, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { materialize } from "./plan-import/service";
import type { PlanBlock, PlanRow } from "./plan-import/types";

/**
 * Plan propio (sin PDF ni IA): se crea vacío como BORRADOR con los días de la
 * semana elegidos, se rellena día a día y se activa como el plan con IA.
 */
const TYPES = ["STRENGTH", "TECHNICAL", "TRACK", "MIXED"] as const;

export const manualPlanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  start: isoDate,
  weeks: z.number().int().min(1).max(16),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7), // 0 = lunes
  type: z.enum(TYPES).default("STRENGTH"),
});

const rowSchema = z.object({
  exercise: z.string().trim().min(1).max(120),
  sets: z.string().trim().max(40).default(""),
  load: z.string().trim().max(40).default(""),
  rir: z.string().trim().max(20).default(""),
  rest: z.string().trim().max(20).default(""),
  how: z.string().trim().max(300).default(""),
});

export const manualDaySchema = z.object({
  title: z.string().trim().min(1).max(120),
  durationMin: z.number().int().min(5).max(400).nullable(),
  type: z.enum(TYPES),
  notes: z.string().trim().max(2000).default(""),
  rows: z.array(rowSchema).max(40),
});

const WD = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const json = (v: unknown) => v as Prisma.InputJsonValue;

async function nextCode(userId: string) {
  const codes = await prisma.planMeso.findMany({ where: { userId, code: { startsWith: "P" } }, select: { code: true } });
  const n = Math.max(0, ...codes.map((c) => Number(/^P(\d+)$/.exec(c.code)?.[1] ?? 0))) + 1;
  return `P${n}`;
}

export async function createManualPlan(userId: string, input: z.infer<typeof manualPlanSchema>) {
  // El bloque empieza el lunes de la semana de inicio
  const start = dateOnly(input.start);
  const monday = addDays(start, -((start.getUTCDay() + 6) % 7));
  const end = addDays(monday, input.weeks * 7 - 1);
  const code = await nextCode(userId);
  const weeks = Array.from({ length: input.weeks }, (_, i) => ({ variant: null, number: i + 1, title: null, start: toIsoDay(addDays(monday, i * 7)), end: toIsoDay(addDays(monday, i * 7 + 6)), text: "" }));
  const days = weeks.flatMap((w, i) =>
    [...new Set(input.weekdays)]
      .sort()
      .map((wd) => addDays(monday, i * 7 + wd))
      .filter((d) => d >= start)
      .map((d) => ({
        userId,
        key: `${code}|-|${toIsoDay(d)}|1`,
        week: w.number,
        code: `S${w.number}`,
        date: d,
        title: `${WD[(d.getUTCDay() + 6) % 7]} · entreno`,
        type: input.type,
        content: json([{ kind: "table", rows: [] }]),
      })),
  );
  return prisma.planMeso.create({
    data: {
      userId,
      code,
      name: input.name,
      startDate: monday,
      endDate: end,
      intro: json([]),
      weeks: json(weeks),
      variants: json([]),
      source: "MANUAL",
      status: "DRAFT",
      days: { create: days },
    },
    select: { code: true },
  });
}

async function ownDay(userId: string, dayId: string) {
  const d = await prisma.planDay.findFirst({ where: { id: dayId, userId }, include: { meso: { select: { id: true, source: true, status: true } } } });
  if (!d || d.meso.source !== "MANUAL") throw new ApiError(404, "Día no encontrado en tus planes propios");
  return d;
}

const rematerialize = (userId: string, mesoId: string) => prisma.$transaction((tx) => materialize(tx, userId, mesoId), { timeout: 60_000, maxWait: 10_000 });

export function dayContent(input: z.infer<typeof manualDaySchema>): PlanBlock[] {
  const rows: PlanRow[] = input.rows.map((r) => ({ ...r, ramp: false }));
  return [...(input.notes ? [{ kind: "text" as const, title: null, text: input.notes }] : []), { kind: "table" as const, rows }];
}

export async function updateManualDay(userId: string, dayId: string, input: z.infer<typeof manualDaySchema>) {
  const d = await ownDay(userId, dayId);
  await prisma.planDay.update({ where: { id: d.id }, data: { title: input.title, durationMin: input.durationMin, type: input.type, content: json(dayContent(input)) } });
  if (d.meso.status === "ACTIVE") await rematerialize(userId, d.meso.id);
  return { ok: true };
}

/** Copia los días de una semana en la siguiente (mismo día de la semana), sustituyendo lo que hubiera. */
export async function duplicateWeek(userId: string, code: string, from: number) {
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId, code } }, include: { days: true } });
  if (!meso || meso.source !== "MANUAL") throw new ApiError(404, "Plan no encontrado");
  const src = meso.days.filter((d) => d.week === from && d.date);
  const to = from + 1;
  const weeks = meso.weeks as Array<{ number: number; start: string }>;
  const target = weeks.find((w) => w.number === to);
  if (!target) throw new ApiError(400, "No hay semana siguiente");
  for (const d of src) {
    const date = addDays(d.date!, 7);
    const key = `${code}|-|${toIsoDay(date)}|1`;
    const data = { title: d.title, durationMin: d.durationMin, type: d.type, content: json(d.content) };
    await prisma.planDay.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, mesoId: meso.id, key, week: to, code: `S${to}`, date, ...data },
      update: data,
    });
  }
  if (meso.status === "ACTIVE") await rematerialize(userId, meso.id);
  return { copied: src.length };
}
