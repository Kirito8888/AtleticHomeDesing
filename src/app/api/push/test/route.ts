import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { pushConfigured, sendToUser } from "@/lib/push/service";

/** Notificación de prueba a todos los dispositivos del usuario. */
export const POST = route(async () => {
  const user = await requireUser();
  if (!pushConfigured()) throw new ApiError(503, "Las notificaciones no están configuradas en el servidor");
  enforceRateLimit("export", user.id); // 5/h basta para pruebas
  const r = await sendToUser(user.id, { title: "Atlenza", body: "Las notificaciones funcionan en este dispositivo ✅", url: "/settings", tag: "test" });
  if (!r.sent) throw new ApiError(404, "No hay ningún dispositivo con notificaciones activas");
  return r;
});
