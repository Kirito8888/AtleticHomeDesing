import "server-only";

import { addDays, dateOnly, today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

import { rankRecentFoods, type RecentFood } from "./recent-foods-rank";

const MAX_ROWS = 500;

/**
 * Alimentos recientes/habituales de la usuaria (últimos `days` días hasta hoy), agrupados sin duplicar datos.
 * Una consulta acotada por `userId`; excluye productos sin datos (darían 422 al añadir) y propios de otra persona.
 */
export async function recentFoods(userId: string, opts: { days?: number; limit?: number } = {}): Promise<RecentFood[]> {
  const { days = 30, limit = 12 } = opts;
  const end = today();
  const rows = await prisma.macros.findMany({
    where: { userId, date: { gte: dateOnly(toIsoDay(addDays(end, -days))), lte: dateOnly(toIsoDay(end)) } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: {
      mealType: true,
      quantityG: true,
      createdAt: true,
      customName: true,
      kcal: true,
      proteinG: true,
      carbsG: true,
      fatG: true,
      fiberG: true,
      foodProduct: {
        select: { id: true, name: true, brand: true, servingSizeG: true, kcalPer100g: true, proteinPer100g: true, carbsPer100g: true, fatPer100g: true, nutriScore: true, ownerId: true },
      },
    },
  });
  const usable = rows.filter((r) => !r.foodProduct || (r.foodProduct.kcalPer100g != null && (!r.foodProduct.ownerId || r.foodProduct.ownerId === userId)));
  return rankRecentFoods(usable, limit);
}
