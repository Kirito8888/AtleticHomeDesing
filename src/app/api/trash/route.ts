import { listTrash } from "@/lib/account/trash";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** v1.8 · Lo que está en la papelera (7 días). */
export const GET = route(async () => {
  const user = await requireUser();
  return listTrash(user.id);
});
