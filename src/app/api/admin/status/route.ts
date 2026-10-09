import { ApiError, route } from "@/lib/api";
import { serverStatus } from "@/lib/admin/status";
import { requireUser } from "@/lib/auth/session";

/** Estado del servidor (solo admin). */
export const GET = route(async () => {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Solo para administración");
  return serverStatus();
});
