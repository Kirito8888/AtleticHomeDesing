import "server-only";

import { toIsoDay } from "@/lib/dates";
import { SESSION_TYPE_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type SearchHit = { href: string; title: string; detail?: string };
export type SearchGroup = { key: string; label: string; hits: SearchHit[] };

/**
 * Búsqueda global (solo datos del usuario): sesiones (también por etiqueta), ejercicios, días del plan,
 * tareas y apuntes; v1.8: rutinas, trabajos, recetas, competiciones y suplementos. Nada de salud cifrada.
 */
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
  // v1.8
  const tag = q.toLowerCase().replace(/^#/, "");
  const [tagged, routines, assignments, recipes, comps] = await Promise.all([
    prisma.trainingSession.findMany({ where: { userId, tags: { has: tag } }, orderBy: { date: "desc" }, take, select: { id: true, date: true, title: true, type: true } }),
    prisma.routineProfile.findMany({ where: { userId, mesoCode: has }, orderBy: { createdAt: "desc" }, take, select: { id: true, mesoCode: true, createdAt: true } }),
    prisma.assignment.findMany({ where: { userId, OR: [{ title: has }, { subject: has }] }, orderBy: { dueOn: "asc" }, take, select: { title: true, subject: true, dueOn: true, status: true } }),
    prisma.recipe.findMany({ where: { userId, name: has }, orderBy: { name: "asc" }, take, select: { name: true, servings: true } }),
    prisma.calendarEvent.findMany({ where: { userId, type: "COMPETITION", OR: [{ title: has }, { location: has }] }, orderBy: { startAt: "desc" }, take, select: { id: true, title: true, startAt: true } }),
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
    {
      key: "tags",
      label: `Etiqueta «${tag}»`,
      hits: tagged.filter((t) => !sessions.some((s) => s.id === t.id)).map((s) => ({ href: `/training/${s.id}`, title: s.title ?? SESSION_TYPE_LABEL[s.type], detail: toIsoDay(s.date) })),
    },
    { key: "competitions", label: "Competiciones", hits: comps.map((c) => ({ href: `/planning/competition/${c.id}`, title: c.title, detail: toIsoDay(c.startAt) })) },
    { key: "routines", label: "Rutinas", hits: routines.map((r) => ({ href: `/training/routine/${r.id}`, title: `Rutina ${r.mesoCode}`, detail: toIsoDay(r.createdAt) })) },
    { key: "assignments", label: "Trabajos", hits: assignments.map((a) => ({ href: "/study/assignments", title: `${a.subject} · ${a.title}`, detail: `${toIsoDay(a.dueOn)}${a.status === "DONE" ? " · entregado" : ""}` })) },
    { key: "recipes", label: "Recetas", hits: recipes.map((r) => ({ href: "/nutrition/recipes", title: r.name, detail: `${r.servings} raciones` })) },
  ];
  return groups.filter((g) => g.hits.length);
}
