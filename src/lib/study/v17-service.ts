import "server-only";

import type { z } from "zod";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { assignmentAlert, type AssignmentStatus, type assignmentSchema, focusBySlot, subjectAverages } from "./v17-study";

/** 22 · Tarjetas a mano en un mazo (se crea si no existe). Se repasan con el mismo SM-2. */
export async function addManualCards(userId: string, deck: string, subject: string | null, cards: Array<{ front: string; back: string }>) {
  if (!cards.length) throw new ApiError(400, "No hay tarjetas válidas");
  const d = await prisma.flashcardDeck.upsert({ where: { userId_name: { userId, name: deck } }, create: { userId, name: deck, subject }, update: {}, select: { id: true } });
  await prisma.flashcard.createMany({ data: cards.map((c) => ({ deckId: d.id, front: c.front, back: c.back })) });
  await prisma.flashcardDeck.update({ where: { id: d.id }, data: { updatedAt: new Date() } });
  return { deckId: d.id, added: cards.length };
}

// 23 · Trabajos y entregas
type AssignmentInput = z.infer<typeof assignmentSchema>;
export async function createAssignment(userId: string, a: AssignmentInput) {
  return prisma.assignment.create({ data: { userId, ...a, dueOn: dateOnly(a.dueOn), weightPct: a.weightPct ?? null, grade: a.grade ?? null, notes: a.notes ?? null }, select: { id: true } });
}

export async function updateAssignment(userId: string, id: string, p: Partial<AssignmentInput>) {
  const { count } = await prisma.assignment.updateMany({ where: { id, userId }, data: { ...p, ...(p.dueOn ? { dueOn: dateOnly(p.dueOn) } : {}) } });
  if (!count) throw new ApiError(404, "Trabajo no encontrado");
}

export async function deleteAssignment(userId: string, id: string) {
  const { count } = await prisma.assignment.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "Trabajo no encontrado");
}

export async function assignmentsView(userId: string, today: string) {
  const rows = await prisma.assignment.findMany({ where: { userId }, orderBy: [{ dueOn: "asc" }] });
  const list = rows.map((r) => {
    const a = { id: r.id, subject: r.subject, title: r.title, dueOn: toIsoDay(r.dueOn), status: r.status as AssignmentStatus, weightPct: r.weightPct, grade: r.grade, notes: r.notes };
    return { ...a, alert: assignmentAlert(a, today) };
  });
  return { open: list.filter((a) => a.status !== "DONE"), done: list.filter((a) => a.status === "DONE").reverse().slice(0, 30), averages: subjectAverages(list) };
}

// 24 · Concentración por franja (últimos 60 días)
export async function focusStats(userId: string, today: string) {
  const rows = await prisma.studySession.findMany({ where: { userId, date: { gte: addDays(dateOnly(today), -59) } }, select: { createdAt: true, minutes: true } });
  return { ...focusBySlot(rows), total: rows.length };
}
