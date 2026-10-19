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

/** Un día de un plan propio o de un borrador de rutina (la rutina ya activa no se edita desde aquí). */
async function ownDay(userId: string, dayId: string) {
  const d = await prisma.planDay.findFirst({ where: { id: dayId, userId }, include: { meso: { select: { id: true, source: true, status: true } } } });
  if (!d || !(d.meso.source === "MANUAL" || (d.meso.source === "ROUTINE" && d.meso.status === "DRAFT"))) throw new ApiError(404, "Día no encontrado en tus planes propios ni en un borrador de rutina");
  return d;
}

const rematerialize = (userId: string, mesoId: string) => prisma.$transaction((tx) => materialize(tx, userId, mesoId), { timeout: 60_000, maxWait: 10_000 });

export function dayContent(input: z.infer<typeof manualDaySchema>): PlanBlock[] {
  const rows: PlanRow[] = input.rows.map((r) => ({ ...r, ramp: false }));
  return [...(input.notes ? [{ kind: "text" as const, title: null, text: input.notes }] : []), { kind: "table" as const, rows }];
}

/**
 * Borrador de rutina: solo cambia la tabla de ejercicios; calentamiento, «Dónde» y «Por qué» se quedan y cada fila
 * que conserva su ejercicio mantiene su justificación y citas (`basis`).
 */
export function routineDayContent(current: PlanBlock[], input: z.infer<typeof manualDaySchema>): PlanBlock[] {
  const basis = new Map(current.flatMap((b) => (b.kind === "table" ? b.rows : [])).flatMap((r) => (r.basis ? [[r.exercise, r.basis] as const] : [])));
  const rows: PlanRow[] = input.rows.map((r) => ({ ...r, ramp: false, ...(basis.has(r.exercise) ? { basis: basis.get(r.exercise) } : {}) }));
  let done = false;
  return current.map((b) => (b.kind === "table" && !done ? ((done = true), { kind: "table" as const, rows }) : b));
}

export async function updateManualDay(userId: string, dayId: string, input: z.infer<typeof manualDaySchema>) {
  const d = await ownDay(userId, dayId);
  const content = d.meso.source === "ROUTINE" ? routineDayContent(d.content as PlanBlock[], input) : dayContent(input);
  await prisma.planDay.update({ where: { id: d.id }, data: { title: input.title, durationMin: input.durationMin, type: input.type, content: json(content) } });
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

// ---------- v1.6 · Semanas tipo (solo planes propios) ----------

export const weekTemplateSchema = z.object({ name: z.string().trim().min(1).max(60), week: z.number().int().min(1).max(60) });
type WeekTemplateDay = { weekday: number; title: string; durationMin: number | null; type: string; content: unknown };

/** Guarda una semana de un plan propio como semana tipo (lunes = 0). */
export async function saveWeekTemplate(userId: string, code: string, input: z.infer<typeof weekTemplateSchema>) {
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId, code } }, include: { days: true } });
  if (!meso || meso.source !== "MANUAL") throw new ApiError(404, "Plan no encontrado");
  const days: WeekTemplateDay[] = meso.days
    .filter((d) => d.week === input.week && d.date)
    .map((d) => ({ weekday: (d.date!.getUTCDay() + 6) % 7, title: d.title, durationMin: d.durationMin, type: d.type, content: d.content }));
  if (!days.length) throw new ApiError(400, "Esa semana no tiene días");
  return prisma.weekTemplate.upsert({
    where: { userId_name: { userId, name: input.name } },
    create: { userId, name: input.name, days: json(days) },
    update: { days: json(days) },
    select: { id: true },
  });
}

/**
 * Aplica una semana tipo a una semana de un plan propio: rellena o sustituye los días de
 * esa semana por día de la semana. Nunca toca planes importados ni con IA, ni días ya hechos.
 */
export async function applyWeekTemplate(userId: string, code: string, week: number, templateId: string) {
  const [meso, tpl] = await Promise.all([
    prisma.planMeso.findUnique({ where: { userId_code: { userId, code } }, include: { days: { select: { key: true, date: true, sessionId: true } } } }),
    prisma.weekTemplate.findFirst({ where: { id: templateId, userId } }),
  ]);
  if (!meso || meso.source !== "MANUAL") throw new ApiError(404, "Plan no encontrado");
  if (!tpl) throw new ApiError(404, "Semana tipo no encontrada");
  const target = (meso.weeks as Array<{ number: number; start: string }>).find((w) => w.number === week);
  if (!target) throw new ApiError(400, "Esa semana no existe en el plan");
  const done = new Set(
    (await prisma.trainingSession.findMany({ where: { userId, status: "COMPLETED", id: { in: meso.days.flatMap((d) => (d.sessionId ? [d.sessionId] : [])) } }, select: { id: true } })).map((s) => s.id),
  );
  let applied = 0;
  for (const d of tpl.days as WeekTemplateDay[]) {
    const date = addDays(dateOnly(target.start), d.weekday);
    const key = `${code}|-|${toIsoDay(date)}|1`;
    const existing = meso.days.find((x) => x.key === key);
    if (existing?.sessionId && done.has(existing.sessionId)) continue;
    const data = { title: d.title, durationMin: d.durationMin, type: d.type as never, content: json(d.content) };
    await prisma.planDay.upsert({ where: { userId_key: { userId, key } }, create: { userId, mesoId: meso.id, key, week, code: `S${week}`, date, ...data }, update: data });
    applied++;
  }
  if (meso.status === "ACTIVE") await rematerialize(userId, meso.id);
  return { applied };
}

// ---------- v2.0 B · Copiar a varios atletas (borrador en cada una) ----------

export type DraftSourceDay = { date: string; title: string; durationMin: number | null; type: string; content: unknown };

const mondayOf = (d: Date) => addDays(d, -((d.getUTCDay() + 6) % 7));

/** Fechas concretas de una semana tipo de la entrenadora a partir de `start` (el lunes de esa semana; los días anteriores a `start` se omiten). */
export async function templateSourceDays(coachId: string, templateId: string, start: string): Promise<DraftSourceDay[]> {
  const tpl = await prisma.weekTemplate.findFirst({ where: { id: templateId, userId: coachId } });
  if (!tpl) throw new ApiError(404, "Semana tipo no encontrada");
  const first = dateOnly(start);
  const monday = mondayOf(first);
  return (tpl.days as WeekTemplateDay[])
    .map((d) => ({ date: toIsoDay(addDays(monday, d.weekday)), title: d.title, durationMin: d.durationMin, type: d.type, content: d.content }))
    .filter((d) => d.date >= toIsoDay(first))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Días de un plan propio de la entrenadora desplazados para que empiece el lunes de `start`. */
export async function planSourceDays(coachId: string, code: string, start: string): Promise<DraftSourceDay[]> {
  const meso = await prisma.planMeso.findUnique({ where: { userId_code: { userId: coachId, code } }, include: { days: true } });
  if (!meso || meso.source !== "MANUAL") throw new ApiError(404, "Plan no encontrado");
  const first = dateOnly(start);
  const shift = Math.round((mondayOf(first).getTime() - meso.startDate.getTime()) / 864e5);
  return meso.days
    .filter((d) => d.date)
    .map((d) => ({ date: toIsoDay(addDays(d.date!, shift)), title: d.title, durationMin: d.durationMin, type: d.type, content: d.content }))
    .filter((d) => d.date >= toIsoDay(first))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Crea un plan propio en BORRADOR con esos días (nunca activo, nunca crea sesiones: la atleta lo activa). */
export async function createManualDraftFromDays(userId: string, input: { name: string; days: DraftSourceDay[]; meta: Record<string, unknown> }) {
  if (!input.days.length) throw new ApiError(422, "No hay días que copiar a partir de esa fecha");
  const dates = input.days.map((d) => dateOnly(d.date));
  const monday = mondayOf(dates.reduce((a, b) => (a < b ? a : b)));
  const last = dates.reduce((a, b) => (a > b ? a : b));
  const nWeeks = Math.floor((last.getTime() - monday.getTime()) / (7 * 864e5)) + 1;
  const code = await nextCode(userId);
  const weeks = Array.from({ length: nWeeks }, (_, i) => ({ variant: null, number: i + 1, title: null, start: toIsoDay(addDays(monday, i * 7)), end: toIsoDay(addDays(monday, i * 7 + 6)), text: "" }));
  return prisma.planMeso.create({
    data: {
      userId,
      code,
      name: input.name.slice(0, 80),
      startDate: monday,
      endDate: addDays(monday, nWeeks * 7 - 1),
      intro: json([]),
      weeks: json(weeks),
      variants: json([]),
      source: "MANUAL",
      status: "DRAFT",
      meta: json(input.meta),
      days: {
        create: input.days.map((d) => {
          const date = dateOnly(d.date);
          const week = Math.floor((date.getTime() - monday.getTime()) / (7 * 864e5)) + 1;
          return { userId, key: `${code}|-|${d.date}|1`, week, code: `S${week}`, date, title: d.title, durationMin: d.durationMin, type: d.type as never, content: json(d.content) };
        }),
      },
    },
    select: { code: true },
  });
}
