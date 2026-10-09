import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteProtocol, saveProtocol, startProtocol } from "@/lib/recovery/protocol-service";

type Ctx = RouteContext<"/api/recovery/injuries/[id]/protocol">;

/** Vuelta tras lesión por fases: crear (plantilla), guardar criterios y quitar. Solo la persona lesionada. */
export const POST = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  return startProtocol(user.id, (await ctx.params).id);
});

export const PUT = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  return saveProtocol(user.id, (await ctx.params).id, (body as { phases?: unknown } | null)?.phases);
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  await deleteProtocol(user.id, (await ctx.params).id);
  return { ok: true };
});
