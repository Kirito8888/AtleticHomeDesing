import "server-only";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { addDays, dateOnly, isoDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { createOffClient, macrosForQuantity, OffError, type NormalizedFood } from "@/lib/nutrition/openfoodfacts";
import { prisma } from "@/lib/prisma";

/** Un producto de OFF se considera fresco durante 30 días. */
const CACHE_TTL_DAYS = 30;

function off() {
  const e = env();
  return createOffClient({ baseUrl: e.OFF_BASE_URL, userAgent: e.OFF_USER_AGENT });
}

function toDb(food: NormalizedFood, raw?: unknown): Prisma.FoodProductCreateInput {
  return { ...food, raw: raw === undefined ? undefined : (raw as Prisma.InputJsonValue), fetchedAt: new Date() };
}

async function cacheProducts(foods: NormalizedFood[]) {
  const withCode = foods.filter((f) => f.barcode);
  return Promise.all(
    withCode.map((f) =>
      prisma.foodProduct.upsert({ where: { barcode: f.barcode! }, create: toDb(f), update: toDb(f) }),
    ),
  );
}

/**
 * Busca en OpenFoodFacts y cachea los resultados. Si OFF falla o limita,
 * cae a la caché local para que el registro de comidas no se bloquee.
 */
export async function searchFoods(query: string, page: number) {
  try {
    const result = await off().search(query, page);
    const cached = await cacheProducts(result.products);
    return { source: "openfoodfacts" as const, count: result.count, products: cached };
  } catch (err) {
    if (!(err instanceof OffError)) throw err;
    const words = query.split(/\s+/).filter(Boolean);
    const products = await prisma.foodProduct.findMany({
      where: {
        AND: words.map((w) => ({
          OR: [{ name: { contains: w, mode: "insensitive" as const } }, { brand: { contains: w, mode: "insensitive" as const } }],
        })),
      },
      take: 20,
      orderBy: { fetchedAt: "desc" },
    });
    return { source: "cache" as const, warning: err.message, count: products.length, products };
  }
}

export async function getFoodByBarcode(barcode: string) {
  const cached = await prisma.foodProduct.findUnique({ where: { barcode } });
  if (cached && cached.fetchedAt > addDays(new Date(), -CACHE_TTL_DAYS)) return cached;
  try {
    const { food, raw } = await off().product(barcode);
    return prisma.foodProduct.upsert({ where: { barcode }, create: toDb(food, raw), update: toDb(food, raw) });
  } catch (err) {
    if (err instanceof OffError) {
      if (cached) return cached; // mejor un dato algo antiguo que ninguno
      throw new ApiError(err.status, err.message);
    }
    throw err;
  }
}

export const mealTypeEnum = z.enum(["BREAKFAST", "MID_MORNING", "LUNCH", "SNACK", "DINNER", "PRE_WORKOUT", "POST_WORKOUT", "OTHER"]);

export const createEntrySchema = z.union([
  z.object({
    date: isoDate,
    mealType: mealTypeEnum,
    foodProductId: z.string().optional(),
    barcode: z.string().optional(),
    quantityG: z.number().positive().max(5000),
  }).refine((d) => d.foodProductId || d.barcode, "Indica foodProductId o barcode"),
  z.object({
    date: isoDate,
    mealType: mealTypeEnum,
    customName: z.string().trim().min(1).max(200),
    quantityG: z.number().positive().max(5000),
    kcal: z.number().min(0).max(10_000),
    proteinG: z.number().min(0).max(1000),
    carbsG: z.number().min(0).max(1000),
    fatG: z.number().min(0).max(1000),
    fiberG: z.number().min(0).max(500).nullish(),
  }),
]);

export async function createEntry(userId: string, input: z.infer<typeof createEntrySchema>) {
  const date = dateOnly(input.date);
  if ("customName" in input) {
    const { date: _d, ...rest } = input;
    void _d;
    return prisma.macros.create({ data: { userId, date, ...rest } });
  }
  const product = input.foodProductId
    ? await prisma.foodProduct.findUnique({ where: { id: input.foodProductId } })
    : await getFoodByBarcode(input.barcode!);
  if (!product) throw new ApiError(404, "Producto no encontrado");
  if (product.kcalPer100g == null) throw new ApiError(422, "El producto no tiene datos nutricionales; regístralo manualmente");
  return prisma.macros.create({
    data: {
      userId,
      date,
      mealType: input.mealType,
      foodProductId: product.id,
      quantityG: input.quantityG,
      ...macrosForQuantity(product, input.quantityG),
    },
    include: { foodProduct: { select: { name: true, brand: true, imageUrl: true } } },
  });
}

/** Diario de un día: entradas, totales y objetivo (ajustado si hay entrenamiento). */
export async function getDay(userId: string, day: string) {
  const date = dateOnly(day);
  const [entries, goal, trained] = await Promise.all([
    prisma.macros.findMany({
      where: { userId, date },
      orderBy: { createdAt: "asc" },
      include: { foodProduct: { select: { name: true, brand: true, imageUrl: true, barcode: true } } },
    }),
    prisma.nutritionGoal.findFirst({ where: { userId, effectiveFrom: { lte: date } }, orderBy: { effectiveFrom: "desc" } }),
    prisma.trainingSession.count({ where: { userId, date, status: { in: ["COMPLETED", "PLANNED"] } } }),
  ]);
  const totals = entries.reduce(
    (t, e) => ({
      kcal: t.kcal + e.kcal,
      proteinG: t.proteinG + e.proteinG,
      carbsG: t.carbsG + e.carbsG,
      fatG: t.fatG + e.fatG,
      fiberG: t.fiberG + (e.fiberG ?? 0),
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const factor = trained && goal ? goal.trainingDayKcalFactor : 1;
  return {
    date: day,
    isTrainingDay: trained > 0,
    entries,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, r1(v)])),
    goal: goal
      ? {
          kcal: Math.round(goal.kcal * factor),
          // El extra de un día de entreno va a hidratos; proteína y grasa se mantienen.
          carbsG: Math.round(goal.carbsG + (goal.kcal * (factor - 1)) / 4),
          proteinG: goal.proteinG,
          fatG: goal.fatG,
          fiberG: goal.fiberG,
        }
      : null,
  };
}
