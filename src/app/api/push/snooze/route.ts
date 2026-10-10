import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { snoozeNotification } from "@/lib/push/service";

const schema = z.object({ id: z.string().min(1).max(40), minutes: z.number().int().min(10).max(24 * 60).default(60) });

/** v1.8 · «Recordar en 1 h» (desde la notificación del móvil o desde el centro de notificaciones). */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { id, minutes } = await parseBody(req, schema);
  if (!(await snoozeNotification(user.id, id, minutes))) throw new ApiError(404, "Notificación no encontrada");
  return { ok: true };
});
