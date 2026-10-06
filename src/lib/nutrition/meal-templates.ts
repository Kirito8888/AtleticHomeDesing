import "server-only";

import type { MealType } from "@/generated/prisma/enums";
import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const MAX_FAVORITES = 50;

/** Campos nutricionales que se copian tal cual (sin recalcular: mismos totales que el original). */
const copyFields = {
  foodProductId: true,
  customName: true,
  quantityG: true,
  kcal: true,
  proteinG: true,
  carbsG: true,
  fatG: true,
  fiberG: true,
} as const;

/** Copia las entradas de una comida de `fromDay` a `toDay` (p. ej. "repetir el desayuno de ayer"). */
export async function copyMeal(userId: string, fromDay: string, toDay: string, mealType: MealType, toMealType = mealType) {
  const entries = await prisma.macros.findMany({
    where: { userId, date: dateOnly(fromDay), mealType },
    orderBy: { createdAt: "asc" },
    select: copyFields,
  });
  if (!entries.length) throw new ApiError(404, "No hay nada registrado en esa comida");
  const { count } = await prisma.macros.createMany({
    data: entries.map((e) => ({ ...e, userId, date: dateOnly(toDay), mealType: toMealType })),
  });
  return { copied: count };
}

/** Comidas del día anterior que se pueden repetir. */
export async function mealsOfPreviousDay(userId: string, day: string) {
  const rows = await prisma.macros.groupBy({
    by: ["mealType"],
    where: { userId, date: addDays(dateOnly(day), -1) },
    _sum: { kcal: true },
    _count: { _all: true },
  });
  return { fromDay: toIsoDay(addDays(dateOnly(day), -1)), meals: rows.map((r) => ({ mealType: r.mealType, items: r._count._all, kcal: Math.round(r._sum.kcal ?? 0) })) };
}

/** Guarda una comida de un día como favorita (sobrescribe si ya existe con ese nombre). */
export async function saveMealTemplate(userId: string, name: string, day: string, mealType: MealType) {
  const entries = await prisma.macros.findMany({ where: { userId, date: dateOnly(day), mealType }, orderBy: { createdAt: "asc" }, select: copyFields });
  if (!entries.length) throw new ApiError(404, "No hay nada registrado en esa comida");
  const existing = await prisma.mealTemplate.findUnique({ where: { userId_name: { userId, name } }, select: { id: true } });
  if (!existing && (await prisma.mealTemplate.count({ where: { userId } })) >= MAX_FAVORITES) {
    throw new ApiError(400, `Máximo ${MAX_FAVORITES} comidas favoritas`);
  }
  return prisma.$transaction(async (tx) => {
    if (existing) await tx.mealTemplate.delete({ where: { id: existing.id } });
    return tx.mealTemplate.create({
      data: { userId, name, mealType, items: { create: entries } },
      include: { _count: { select: { items: true } } },
    });
  });
}

export async function applyMealTemplate(userId: string, templateId: string, day: string, mealType?: MealType) {
  const tpl = await prisma.mealTemplate.findFirst({ where: { id: templateId, userId }, include: { items: true } });
  if (!tpl) throw new ApiError(404, "Comida favorita no encontrada");
  const target = mealType ?? tpl.mealType ?? "OTHER";
  const { count } = await prisma.macros.createMany({
    data: tpl.items.map(({ id: _id, templateId: _t, ...item }) => {
      void _id;
      void _t;
      return { ...item, userId, date: dateOnly(day), mealType: target };
    }),
  });
  return { added: count, mealType: target };
}

export async function listMealTemplates(userId: string) {
  const rows = await prisma.mealTemplate.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    include: { items: { select: { kcal: true } } },
  });
  return rows.map((t) => ({ id: t.id, name: t.name, mealType: t.mealType, items: t.items.length, kcal: Math.round(t.items.reduce((a, i) => a + i.kcal, 0)) }));
}
