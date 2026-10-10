import { route } from "@/lib/api";
import { serverStatus } from "@/lib/admin/status";
import { requireAdmin } from "@/lib/auth/admin";

/** Estado del servidor (solo admin). */
export const GET = route(async () => {
  await requireAdmin();
  return serverStatus();
});
