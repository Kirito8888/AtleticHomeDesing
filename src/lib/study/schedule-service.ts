import "server-only";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { type ClassSlotInput, examClashes, habitStreak, type Slot, toMin } from "./schedule";

export async function listSlots(userId: string): Promise<Slot[]> {
  const rows = await prisma.classSlot.findMany({ where: { userId }, orderBy: [{ weekday: "asc" }, { date: "asc" }, { startMin: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    kind: r.kind,
    weekday: r.weekday,
    date: r.date ? toIsoDay(r.date) : null,
    startMin: r.startMin,
    endMin: r.endMin,
    validFrom: r.validFrom ? toIsoDay(r.validFrom) : null,
    validTo: r.validTo ? toIsoDay(r.validTo) : null,
    location: r.location,
  }));
}

export async function createSlot(userId: string, s: ClassSlotInput) {
  return prisma.classSlot.create({
    data: {
      userId,
      subject: s.subject,
      kind: s.kind,
      weekday: s.kind === "CLASS" ? s.weekday : null,
      date: s.kind === "EXAM" ? dateOnly(s.date) : null,
      startMin: toMin(s.start),
      endMin: toMin(s.end),
      validFrom: s.kind === "CLASS" && s.validFrom ? dateOnly(s.validFrom) : null,
      validTo: s.kind === "CLASS" && s.validTo ? dateOnly(s.validTo) : null,
      location: s.location || null,
    },
    select: { id: true },
  });
}

export async function deleteSlot(userId: string, id: string) {
  const { count } = await prisma.classSlot.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Clase o examen no encontrado");
}

/** Sesiones planificadas que chocan con exámenes en los próximos `days` días. */
export async function upcomingExamClashes(userId: string, today: string, days = 14) {
  const from = dateOnly(today);
  const [slots, sessions] = await Promise.all([
    listSlots(userId),
    prisma.trainingSession.findMany({
      where: { userId, status: "PLANNED", date: { gte: from, lte: addDays(from, days) } },
      select: { id: true, date: true, title: true, type: true },
    }),
  ]);
  const clashes = examClashes(
    slots,
    sessions.map((s) => ({ id: s.id, date: toIsoDay(s.date), title: s.title ?? "Sesión" })),
  );
  const nextExam = slots.filter((s) => s.kind === "EXAM" && s.date && s.date >= today).sort((a, b) => a.date!.localeCompare(b.date!) || a.startMin - b.startMin)[0] ?? null;
  return { slots, clashes, nextExam };
}

/** Asignaturas que ya usas (horario y estudio), para el selector del pomodoro. */
export async function knownSubjects(userId: string): Promise<string[]> {
  const [a, b] = await Promise.all([
    prisma.classSlot.findMany({ where: { userId }, distinct: ["subject"], select: { subject: true } }),
    prisma.studySession.findMany({ where: { userId }, distinct: ["subject"], select: { subject: true } }),
  ]);
  return [...new Set([...a, ...b].map((x) => x.subject))].sort((x, y) => x.localeCompare(y, "es"));
}

/** Hábitos activos con su racha (últimos 400 días). */
export async function habitsToday(userId: string, today: string) {
  const habits = await prisma.habit.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "asc" },
    include: { logs: { where: { date: { gte: addDays(dateOnly(today), -400) } }, select: { date: true } } },
  });
  return habits.map((h) => ({ id: h.id, name: h.name, ...habitStreak(h.logs.map((l) => toIsoDay(l.date)), today) }));
}

/** Marca o desmarca un hábito en un día. Devuelve si queda hecho. */
export async function toggleHabit(userId: string, habitId: string, day: string): Promise<boolean> {
  const habit = await prisma.habit.findFirst({ where: { id: habitId, userId }, select: { id: true } });
  if (!habit) throw new ApiError(404, "Hábito no encontrado");
  const date = dateOnly(day);
  const { count } = await prisma.habitLog.deleteMany({ where: { habitId, date } });
  if (count) return false;
  await prisma.habitLog.upsert({ where: { habitId_date: { habitId, date } }, create: { userId, habitId, date }, update: {} });
  return true;
}
