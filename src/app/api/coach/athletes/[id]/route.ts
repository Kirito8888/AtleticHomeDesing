import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { updateFicha } from "@/lib/managed/portfolio";

/** Edita o archiva una ficha propia. Otra entrenadora → 404. */
export const PATCH = route(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await params;
  await updateFicha(user, id, await req.json().catch(() => null));
  return { ok: true };
});
