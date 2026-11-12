import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setAccountArchived } from "@/lib/finance/service";

const schema = z.object({ isArchived: z.boolean() });

/**
 * `PATCH /api/finance/accounts/[id]` · Archivar o reactivar una cuenta de dinero (activo o deuda).
 * Una cuenta archivada sigue contando en el balance, pero el servidor rechaza cualquier apunte nuevo o edición sobre ella.
 *
 * - Entrada: JSON `{ isArchived }`. Salida: 200 la cuenta con su saldo (`balanceCents`).
 * - Errores: 400 datos no válidos · 401 · 403 origen/condiciones · 404 no es suya · 409 no es una cuenta de dinero.
 */
export const PATCH = route(async (req, ctx: RouteContext<"/api/finance/accounts/[id]">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return setAccountArchived(user.id, id, (await parseBody(req, schema)).isArchived);
});
