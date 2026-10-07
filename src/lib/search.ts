import "server-only";

import { toIsoDay } from "@/lib/dates";
import { SESSION_TYPE_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type SearchHit = { href: string; title: string; detail?: string };
export type SearchGroup = { key: string; label: string; hits: SearchHit[] };

/** Búsqueda global (solo datos del usuario): sesiones, ejercicios, días del plan, tareas y apuntes. */
export async function searchAll(userId: string, raw: string, take = 8): Promise<SearchGroup[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return [];
  const has = { contains: q, mode: "insensitive" as const };
  const [sessions, exercises, days, tasks, docs] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId, OR: [{ title: has }, { notes: has }] },
      orderBy: { date: "desc" },
      take,
      select: { id: true, date: true, title: true, type: true, status: true },
    }),
    prisma.exercise.findMany({ where: { OR: [{ userId }, { userId: null }], name: has }, orderBy: { name: "asc" }, take, select: { id: true, name: true } }),
    prisma.planDay.findMany({
      where: { userId, OR: [{ title: has }, { code: has }] },
      orderBy: { date: "asc" },
      take,
      select: { id: true, title: true, code: true, date: true, meso: { select: { code: true } } },
    }),
    prisma.task.findMany({ where: { userId, OR: [{ title: has }, { description: has }] }, orderBy: { updatedAt: "desc" }, take, select: { id: true, title: true, status: true } }),
    prisma.studyDocument.findMany({ where: { userId, OR: [{ title: has }, { subject: has }] }, orderBy: { createdAt: "desc" }, take, select: { id: true, title: true, subject: true } }),
  ]);
  const groups: SearchGroup[] = [
    {
      key: "sessions",
      label: "Sesiones",
      hits: sessions.map((s) => ({ href: `/training/${s.id}`, title: s.title ?? SESSION_TYPE_LABEL[s.type], detail: `${toIsoDay(s.date)}${s.status === "PLANNED" ? " · planificada" : ""}` })),
    },
    { key: "exercises", label: "Ejercicios", hits: exercises.map((e) => ({ href: `/training/performance?ex=${e.id}`, title: e.name })) },
    {
      key: "plan",
      label: "Días del plan",
      hits: days.map((d) => ({ href: `/planning/plan/${d.id}`, title: d.title, detail: [d.meso.code, d.code, d.date ? toIsoDay(d.date) : null].filter(Boolean).join(" · ") })),
    },
    { key: "tasks", label: "Tareas", hits: tasks.map((t) => ({ href: "/planning", title: t.title, detail: t.status === "DONE" ? "hecha" : undefined })) },
    { key: "docs", label: "Apuntes", hits: docs.map((d) => ({ href: "/study", title: d.title, detail: d.subject ?? undefined })) },
  ];
  return groups.filter((g) => g.hits.length);
}
