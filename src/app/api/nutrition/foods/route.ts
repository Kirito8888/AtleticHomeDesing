import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createOwnFood, ownFoodSchema } from "@/lib/nutrition/service";

/** v1.10 · Alimentos propios (por 100 g): solo los ve quien los crea. */
export const GET = route(async () => {
  const user = await requireUser();
  return prisma.foodProduct.findMany({ where: { ownerId: user.id }, orderBy: { name: "asc" }, omit: { raw: true } });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return createOwnFood(user.id, await parseBody(req, ownFoodSchema));
});
