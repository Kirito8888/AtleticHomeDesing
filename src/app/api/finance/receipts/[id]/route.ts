import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { deleteReceipt, readReceipt } from "@/lib/finance/v17-service";

type Ctx = RouteContext<"/api/finance/receipts/[id]">;

/** Se descifra al vuelo y nunca se guarda en caché. Los PDF se descargan (no se abren en la app). */
export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { mime, bytes } = await readReceipt(user.id, id);
  const pdf = mime === "application/pdf";
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": mime, "Cache-Control": "private, no-store", "Content-Disposition": pdf ? `attachment; filename="justificante-${id}.pdf"` : "inline" },
  });
});

export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await deleteReceipt(user.id, id);
  return { ok: true };
});
