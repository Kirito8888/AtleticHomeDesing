import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { runDueSubscriptions } from "@/lib/finance/service";

/** Contabiliza los cobros vencidos de suscripciones con autoPost. Idempotente. */
export const POST = route(async () => {
  const user = await requireUser();
  return { posted: await runDueSubscriptions(user.id) };
});
