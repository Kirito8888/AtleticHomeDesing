import { testSaved } from "@/lib/ai/credentials";
import { enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";

/** v1.9 · «Probar conexión» con la IA propia guardada (no envía ningún dato tuyo). */
export const POST = route(async () => {
  const user = await requireUser();
  enforceRateLimit("aiProvider", user.id);
  return testSaved(user.id);
});
