import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { vapidKeys } from "@/lib/push/service";

/** Clave pública VAPID (la necesita el navegador para suscribirse) y nº de dispositivos. */
export const GET = route(async () => {
  const user = await requireUser();
  const vapid = vapidKeys();
  const devices = await prisma.pushSubscription.count({ where: { userId: user.id } });
  return { configured: vapid != null, publicKey: vapid?.publicKey ?? null, devices };
});
