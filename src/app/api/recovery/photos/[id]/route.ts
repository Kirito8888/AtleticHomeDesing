import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteInjuryPhoto, readInjuryPhoto } from "@/lib/recovery/wellbeing-service";

type Ctx = RouteContext<"/api/recovery/photos/[id]">;

/** Se descifra al vuelo; nunca se guarda en caché (ni del navegador ni de intermedios). */
export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { mime, bytes } = await readInjuryPhoto(user.id, id);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "Content-Disposition": "inline" } });
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteInjuryPhoto(user.id, id);
  return { ok: true };
});
