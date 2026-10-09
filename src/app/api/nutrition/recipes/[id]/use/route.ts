import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { dateOnly, isoDate } from "@/lib/dates";
import { recipeMacros, recipeSchema } from "@/lib/nutrition/kitchen";
import { mealTypeEnum } from "@/lib/nutrition/service";
import { prisma } from "@/lib/prisma";

/** Usar una receta: anotarla en un día (raciones) o guardarla como comida favorita. */
export const POST = route(async (req, ctx: RouteContext<"/api/nutrition/recipes/[id]/use">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await parseBody(
    req,
    z.discriminatedUnion("as", [
      z.object({ as: z.literal("entry"), date: isoDate, mealType: mealTypeEnum, servings: z.number().min(0.25).max(10) }),
      z.object({ as: z.literal("favorite"), mealType: mealTypeEnum.nullish() }),
    ]),
  );
  const row = await prisma.recipe.findFirst({ where: { id, userId: user.id } });
  if (!row) throw new ApiError(404, "Receta no encontrada");
  const r = recipeSchema.parse({ name: row.name, servings: row.servings, items: row.items });
  const per = recipeMacros(r.items, r.servings).perServing;
  if (body.as === "entry") {
    const k = body.servings;
    await prisma.macros.create({
      data: { userId: user.id, date: dateOnly(body.date), mealType: body.mealType, customName: r.name, quantityG: per.grams * k, kcal: per.kcal * k, proteinG: per.proteinG * k, carbsG: per.carbsG * k, fatG: per.fatG * k },
    });
    return { ok: true };
  }
  await prisma.mealTemplate.upsert({
    where: { userId_name: { userId: user.id, name: r.name } },
    create: { userId: user.id, name: r.name, mealType: body.mealType ?? null, items: { create: [{ customName: r.name, quantityG: per.grams, kcal: per.kcal, proteinG: per.proteinG, carbsG: per.carbsG, fatG: per.fatG }] } },
    update: {},
  });
  return { ok: true };
});
