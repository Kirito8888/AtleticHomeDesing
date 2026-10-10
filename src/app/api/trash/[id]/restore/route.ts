import { restoreTrash } from "@/lib/account/trash";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** v1.8 · Deshacer un borrado: vuelve a crear la sesión, la comida o el movimiento con su id. */
export const POST = route(async (_req, ctx: RouteContext<"/api/trash/[id]/restore">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return restoreTrash(user.id, id);
});
