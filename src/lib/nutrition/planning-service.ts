import "server-only";

import { ApiError } from "@/lib/api";
import { addDays, dateOnly, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { recipeSchema } from "./kitchen";
import { type PlanMeal, planDayMacros, shoppingFromPlan, type SweatTest, sweatRate } from "./planning";

const items = (r: { name: string; servings: number; items: unknown }) => recipeSchema.safeParse({ name: r.name, servings: r.servings, items: r.items }).data?.items ?? [];

/** 18 · Semana del plan de comidas (lunes `weekStart`). */
export async function mealPlanWeek(userId: string, weekStart: string) {
  const from = dateOnly(weekStart);
  const [rows, recipes] = await Promise.all([
    prisma.mealPlanEntry.findMany({ where: { userId, date: { gte: from, lte: addDays(from, 6) } }, include: { recipe: true }, orderBy: { createdAt: "asc" } }),
    prisma.recipe.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true, servings: true } }),
  ]);
  const entries = rows.map((r) => ({ id: r.id, date: toIsoDay(r.date), mealType: r.mealType as PlanMeal, servings: r.servings, recipeId: r.recipeId, recipeName: r.recipe.name, recipe: { servings: r.recipe.servings, items: items(r.recipe) } }));
  return { entries, recipes, macros: planDayMacros(entries) };
}

export async function addMealPlanEntry(userId: string, e: { date: string; mealType: PlanMeal; recipeId: string; servings: number }) {
  const r = await prisma.recipe.findFirst({ where: { id: e.recipeId, userId }, select: { id: true } });
  if (!r) throw new ApiError(404, "Receta no encontrada");
  return prisma.mealPlanEntry.create({ data: { userId, date: dateOnly(e.date), mealType: e.mealType, recipeId: e.recipeId, servings: e.servings }, select: { id: true } });
}

export async function deleteMealPlanEntry(userId: string, id: string) {
  const { count } = await prisma.mealPlanEntry.deleteMany({ where: { id, userId } });
  if (!count) throw new ApiError(404, "No encontrado");
}

/** Añade a la lista de la compra los ingredientes de la semana que aún no estén. */
export async function shoppingFromWeek(userId: string, weekStart: string) {
  const [{ entries }, have] = await Promise.all([mealPlanWeek(userId, weekStart), prisma.shoppingItem.findMany({ where: { userId, done: false }, select: { name: true } })]);
  const list = shoppingFromPlan(entries, have.map((h) => h.name));
  if (list.length) await prisma.shoppingItem.createMany({ data: list.map((i) => ({ userId, name: i.name.slice(0, 80), qty: i.qty })) });
  return { added: list.length };
}

// 21 · Sudoración
export async function addSweatTest(userId: string, t: SweatTest) {
  if (t.postKg > t.preKg + 2) throw new ApiError(400, "El peso de después no puede ser mucho mayor que el de antes: revisa los datos");
  return prisma.sweatTest.create({ data: { userId, ...t, date: dateOnly(t.date), tempC: t.tempC ?? null, notes: t.notes ?? null }, select: { id: true } });
}

export async function listSweatTests(userId: string) {
  const rows = await prisma.sweatTest.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 20 });
  return rows.map((r) => ({ id: r.id, date: toIsoDay(r.date), minutes: r.minutes, tempC: r.tempC, notes: r.notes, ...sweatRate(r) }));
}
