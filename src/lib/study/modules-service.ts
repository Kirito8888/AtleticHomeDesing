import "server-only";

import { z } from "zod";

import { ApiError } from "@/lib/api";
import { dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";

import type { Tag } from "./adhd-report";
import { daysLeft, moduleSchema, prioritize, type RouteTopic, topicSchema } from "./study-route";

type ModuleInput = z.infer<typeof moduleSchema>;
type TopicInput = z.infer<typeof topicSchema>;

const asTag = (s: string): Tag => (s === "red" || s === "grey" ? s : "yellow");

async function ownModule(userId: string, id: string) {
  const m = await prisma.studyModule.findFirst({ where: { id, userId } });
  if (!m) throw new ApiError(404, "Asignatura no encontrada");
  return m;
}
export const requireModule = ownModule;

export async function listModules(userId: string, today: string) {
  const rows = await prisma.studyModule.findMany({
    where: { userId },
    orderBy: [{ examDate: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    include: { _count: { select: { topics: true, documents: true } }, topics: { select: { done: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    examDate: m.examDate ? toIsoDay(m.examDate) : null,
    daysLeft: daysLeft(today, m.examDate ? toIsoDay(m.examDate) : null),
    prepMode: m.prepMode,
    topics: m._count.topics,
    done: m.topics.filter((t) => t.done).length,
    documents: m._count.documents,
  }));
}

export async function createModule(userId: string, input: ModuleInput) {
  const dup = await prisma.studyModule.findUnique({ where: { userId_name: { userId, name: input.name } } });
  if (dup) throw new ApiError(409, "Ya tienes una asignatura con ese nombre");
  return prisma.studyModule.create({
    data: { userId, name: input.name, examDate: input.examDate ? dateOnly(input.examDate) : null, prepMode: input.prepMode ?? false },
  });
}

export async function updateModule(userId: string, id: string, input: Partial<ModuleInput>) {
  await ownModule(userId, id);
  if (input.name) {
    const dup = await prisma.studyModule.findFirst({ where: { userId, name: input.name, NOT: { id } } });
    if (dup) throw new ApiError(409, "Ya tienes una asignatura con ese nombre");
  }
  return prisma.studyModule.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.examDate !== undefined && { examDate: input.examDate ? dateOnly(input.examDate) : null }),
      ...(input.prepMode !== undefined && { prepMode: input.prepMode }),
    },
  });
}

/** Borra la asignatura y sus temas; los apuntes se conservan (solo pierden el vínculo). */
export async function deleteModule(userId: string, id: string) {
  await ownModule(userId, id);
  await prisma.studyModule.delete({ where: { id } });
}

export async function moduleView(userId: string, id: string, today: string) {
  const m = await ownModule(userId, id);
  const [topics, documents, unassigned, prefs] = await Promise.all([
    prisma.studyTopic.findMany({ where: { moduleId: id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.studyDocument.findMany({ where: { userId, moduleId: id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true } }),
    prisma.studyDocument.findMany({ where: { userId, moduleId: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } }),
    getPrefs(userId),
  ]);
  const examDate = m.examDate ? toIsoDay(m.examDate) : null;
  const left = daysLeft(today, examDate);
  const list: RouteTopic[] = topics.map((t) => ({ id: t.id, name: t.name, tag: asTag(t.tag), minutes: t.minutes, done: t.done }));
  const ranked = prioritize({ topics: list, daysLeft: left, dailyMin: prefs.studyDailyMin });
  return {
    id: m.id,
    name: m.name,
    examDate,
    daysLeft: left,
    prepMode: m.prepMode,
    dailyMin: prefs.studyDailyMin,
    topics: list,
    /** Ruta ordenada: solo se usa con `prepMode`; el temario es el mismo, solo cambia el orden. */
    route: m.prepMode ? ranked : null,
    documents,
    unassigned,
  };
}

export async function addTopic(userId: string, moduleId: string, input: TopicInput, documentId?: string | null) {
  await ownModule(userId, moduleId);
  const last = await prisma.studyTopic.aggregate({ where: { moduleId }, _max: { position: true } });
  return prisma.studyTopic.create({
    data: { userId, moduleId, name: input.name, tag: input.tag, minutes: input.minutes, position: (last._max.position ?? -1) + 1, documentId: documentId ?? null },
  });
}

export const topicPatchSchema = topicSchema.partial().extend({ done: z.boolean().optional() });

export async function updateTopic(userId: string, id: string, input: z.infer<typeof topicPatchSchema>) {
  const t = await prisma.studyTopic.findFirst({ where: { id, userId } });
  if (!t) throw new ApiError(404, "Tema no encontrado");
  return prisma.studyTopic.update({ where: { id }, data: input });
}

export async function deleteTopic(userId: string, id: string) {
  const t = await prisma.studyTopic.findFirst({ where: { id, userId } });
  if (!t) throw new ApiError(404, "Tema no encontrado");
  await prisma.studyTopic.delete({ where: { id } });
}

/** Mete un apunte en la asignatura (iguala `subject` al nombre) y crea un tema con su título si no existe. `moduleId` null lo saca. */
export async function assignDocument(userId: string, documentId: string, moduleId: string | null) {
  const doc = await prisma.studyDocument.findFirst({ where: { id: documentId, userId } });
  if (!doc) throw new ApiError(404, "Apunte no encontrado");
  if (moduleId === null) {
    await prisma.studyDocument.update({ where: { id: documentId }, data: { moduleId: null } });
    return;
  }
  const m = await ownModule(userId, moduleId);
  await prisma.studyDocument.update({ where: { id: documentId }, data: { moduleId, subject: m.name } });
  const has = await prisma.studyTopic.findFirst({ where: { moduleId, documentId } });
  if (!has) await addTopic(userId, moduleId, { name: doc.title.slice(0, 120), tag: "yellow", minutes: 30 }, documentId);
}
