import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteTrip, updateTrip } from "@/lib/finance/trips-service";

/** Reembolsado sí/no, cambiar lo reembolsable, enlazar o soltar un gasto. */
export const PATCH = route(async (req, ctx: RouteContext<"/api/finance/trips/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const body = await parseBody(
    req,
    z.object({ reimbursed: z.boolean().optional(), reimbursableCents: z.number().int().min(0).max(10_000_000).optional(), link: z.string().max(40).optional(), unlink: z.string().max(40).optional() }),
  );
  await updateTrip(user.id, id, body);
  return { ok: true };
});

/** Borra el viaje; sus gastos se quedan (solo se sueltan). */
export const DELETE = route(async (_req, ctx: RouteContext<"/api/finance/trips/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteTrip(user.id, id);
  return { ok: true };
});
