import { z } from "zod";

import { parseBody, parseQuery, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { recipeSchema, shoppingFromFavorites, shoppingItemSchema } from "@/lib/nutrition/kitchen";
import { prisma } from "@/lib/prisma";

/** Lista de la compra: listar · añadir uno o desde favoritas · borrar lo comprado. */
export const GET = route(async () => {
  const user = await requireUser();
  return prisma.shoppingItem.findMany({ where: { userId: user.id }, orderBy: [{ done: "asc" }, { createdAt: "asc" }] });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.union([shoppingItemSchema, z.object({ favorites: z.array(z.string().max(40)).min(1).max(20) })]));
  if ("favorites" in body) {
    const [favs, have] = await Promise.all([
      prisma.mealTemplate.findMany({ where: { userId: user.id, id: { in: body.favorites } }, include: { items: { include: { foodProduct: { select: { name: true } } } } } }),
      prisma.shoppingItem.findMany({ where: { userId: user.id, done: false }, select: { name: true } }),
    ]);
    // Una favorita que viene de una receta propia aporta sus ingredientes (la receta entera), no el plato
    const recipes = await prisma.recipe.findMany({ where: { userId: user.id, name: { in: favs.map((f) => f.name) } } });
    const ingredients = new Map(recipes.map((r) => [r.name, recipeSchema.safeParse({ name: r.name, servings: r.servings, items: r.items }).data?.items]));
    const items = shoppingFromFavorites(
      favs.map((f) => ({ items: ingredients.get(f.name) ?? f.items.map((i) => ({ name: i.foodProduct?.name ?? i.customName ?? "", grams: i.quantityG })) })),
      have.map((h) => h.name),
    );
    if (items.length) await prisma.shoppingItem.createMany({ data: items.map((i) => ({ userId: user.id, name: i.name.slice(0, 80), qty: i.qty })) });
    return { added: items.length };
  }
  return prisma.shoppingItem.create({ data: { userId: user.id, name: body.name, qty: body.qty ?? null }, select: { id: true } });
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  parseQuery(req, z.object({ done: z.literal("1") }));
  const { count } = await prisma.shoppingItem.deleteMany({ where: { userId: user.id, done: true } });
  return { deleted: count };
});
