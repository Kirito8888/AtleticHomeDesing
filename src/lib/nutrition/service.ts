import "server-only";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { addDays, dateOnly, isoDate } from "@/lib/dates";
import { env } from "@/lib/env";
import { createOffClient, macrosForQuantity, OffError, type NormalizedFood } from "@/lib/nutrition/openfoodfacts";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";
import { microsForQuantity } from "@/lib/nutrition/micros";

import { carbDay, carbTarget } from "./carbs";

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
/** v1.10 · Catálogo local (marcas españolas sincronizadas, caché y alimentos propios de `userId`). */
export async function searchLocalFoods(userId: string | null, query: string, take = 20) {
  const words = query.split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
  if (!words.length) return [];
  return prisma.foodProduct.findMany({
    where: {
      OR: [{ ownerId: null }, ...(userId ? [{ ownerId: userId }] : [])],
      AND: words.map((w) => ({
        OR: [{ name: { contains: w, mode: "insensitive" as const } }, { brand: { contains: w, mode: "insensitive" as const } }],
      })),
    },
    take,
    // Primero los propios y los que tienen datos completos
    orderBy: [{ ownerId: { sort: "asc", nulls: "last" } }, { kcalPer100g: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });
}

/**
 * v1.10 · Primero el catálogo local (sin red, y sin gastar el límite de OFF de 10 búsquedas por
 * minuto); OpenFoodFacts en línea solo si en local hay pocos resultados o se pide otra página.
 * Si OFF falla o limita, se queda con lo local para que el registro de comidas no se bloquee.
 */
export async function searchFoods(query: string, page: number, userId: string | null = null) {
  const local = page === 1 ? await searchLocalFoods(userId, query) : [];
  if (local.length >= 8) return { source: "local" as const, count: local.length, products: local };
  try {
    const result = await off().search(query, page);
    const cached = await cacheProducts(result.products);
    const ids = new Set(local.map((p) => p.id));
    return { source: "openfoodfacts" as const, count: result.count, products: [...local, ...cached.filter((p) => !ids.has(p.id))] };
  } catch (err) {
    if (!(err instanceof OffError)) throw err;
    return { source: "cache" as const, warning: err.message, count: local.length, products: local };
  }
}

/** v1.10 · Alimento propio (por 100 g), p. ej. a partir de la etiqueta leída con OCR. Solo lo ve su dueño. */
export const ownFoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(80).nullish(),
  kcalPer100g: z.number().min(0).max(1000),
  proteinPer100g: z.number().min(0).max(100),
  carbsPer100g: z.number().min(0).max(100),
  sugarsPer100g: z.number().min(0).max(100).nullish(),
  fatPer100g: z.number().min(0).max(100),
  satFatPer100g: z.number().min(0).max(100).nullish(),
  fiberPer100g: z.number().min(0).max(100).nullish(),
  saltPer100g: z.number().min(0).max(100).nullish(),
  ironPer100g: z.number().min(0).max(1000).nullish(),
  calciumPer100g: z.number().min(0).max(10_000).nullish(),
  vitDPer100g: z.number().min(0).max(10_000).nullish(),
  b12Per100g: z.number().min(0).max(10_000).nullish(),
  magnesiumPer100g: z.number().min(0).max(10_000).nullish(),
  sodiumPer100g: z.number().min(0).max(40_000).nullish(),
  potassiumPer100g: z.number().min(0).max(40_000).nullish(),
});

export async function createOwnFood(userId: string, input: z.infer<typeof ownFoodSchema>) {
  const sodium = input.sodiumPer100g ?? (input.saltPer100g != null ? Math.round((input.saltPer100g / 2.5) * 1000) : null);
  return prisma.foodProduct.create({ data: { ...input, sodiumPer100g: sodium, ownerId: userId, source: "own" } });
}

export async function deleteOwnFood(userId: string, id: string) {
  const { count } = await prisma.foodProduct.deleteMany({ where: { id, ownerId: userId } });
  if (!count) throw new ApiError(404, "Alimento no encontrado");
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
    ironRich: z.boolean().optional(),
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
    ironRich: z.boolean().optional(),
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
  // Los alimentos propios de otra persona no existen para ti
  if (!product || (product.ownerId && product.ownerId !== userId)) throw new ApiError(404, "Producto no encontrado");
  if (product.kcalPer100g == null) throw new ApiError(422, "El producto no tiene datos nutricionales; regístralo manualmente");
  return prisma.macros.create({
    data: {
      userId,
      date,
      mealType: input.mealType,
      foodProductId: product.id,
      quantityG: input.quantityG,
      ...macrosForQuantity(product, input.quantityG),
      ...microsForQuantity(product, input.quantityG),
      ironRich: input.ironRich ?? false,
    },
    include: { foodProduct: { select: { name: true, brand: true, imageUrl: true } } },
  });
}

/** Diario de un día: entradas, totales y objetivo (ajustado si hay entrenamiento). */
export async function getDay(userId: string, day: string) {
  const date = dateOnly(day);
  const [entries, goal, trained, daySessions, prefs] = await Promise.all([
    prisma.macros.findMany({
      where: { userId, date },
      orderBy: { createdAt: "asc" },
      include: { foodProduct: { select: { name: true, brand: true, imageUrl: true, barcode: true } } },
    }),
    prisma.nutritionGoal.findFirst({ where: { userId, effectiveFrom: { lte: date } }, orderBy: { effectiveFrom: "desc" } }),
    prisma.trainingSession.count({ where: { userId, date, status: { in: ["COMPLETED", "PLANNED"] } } }),
    prisma.trainingSession.findMany({
      where: { userId, date, status: { in: ["COMPLETED", "PLANNED"] } },
      select: { technical: { select: { event: true } }, strength: { select: { id: true } }, type: true },
    }),
    getPrefs(userId),
  ]);
  // Hidratos según el día (Mis reglas): lanzamientos, gimnasio o descanso.
  const kind = carbDay(daySessions.map((s) => ({ event: s.technical?.event ?? null, strength: Boolean(s.strength) || s.type === "STRENGTH" })));
  const carbsOverride = carbTarget(prefs, kind);
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
    carbDay: kind,
    carbsAdjusted: goal != null && carbsOverride != null,
    entries,
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, r1(v)])),
    goal: goal
      ? carbsOverride != null
        ? {
            // Hidratos fijados por tipo de día: las kcal cambian con ellos (4 kcal/g).
            kcal: Math.round(goal.kcal + (carbsOverride - goal.carbsG) * 4),
            carbsG: carbsOverride,
            proteinG: goal.proteinG,
            fatG: goal.fatG,
            fiberG: goal.fiberG,
          }
        : {
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
