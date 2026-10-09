import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { recipeSchema } from "@/lib/nutrition/kitchen";
import { prisma } from "@/lib/prisma";

/** Recetas propias con macros por ingredientes. */
export const GET = route(async () => {
  const user = await requireUser();
  return prisma.recipe.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const r = await parseBody(req, recipeSchema);
  return prisma.recipe.upsert({
    where: { userId_name: { userId: user.id, name: r.name } },
    create: { userId: user.id, name: r.name, servings: r.servings, items: r.items },
    update: { servings: r.servings, items: r.items },
    select: { id: true },
  });
});
