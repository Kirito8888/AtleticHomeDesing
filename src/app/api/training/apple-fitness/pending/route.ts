import { route } from "@/lib/api";
import { listPending } from "@/lib/apple-fitness/inbox-service";
import { requireUser } from "@/lib/auth/session";

/** Bandeja de entrenos del reloj pendientes de revisar. Solo la propia usuaria: ni la entrenadora ni el ADMIN la ven. */
export const GET = route(async () => {
  const user = await requireUser();
  return { items: await listPending(user.id) };
});
