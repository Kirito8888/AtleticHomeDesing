import { checkIntegrity } from "@/lib/admin/ops";
import { route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/admin";

/** v1.8 · Revisión de integridad bajo demanda (solo lectura; la semanal avisa por push). */
export const POST = route(async () => {
  await requireAdmin();
  return checkIntegrity();
});
