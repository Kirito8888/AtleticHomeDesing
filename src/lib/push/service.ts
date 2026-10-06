import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { type PushMessage, sendPush, type SendResult, type VapidKeys } from "@/lib/push/send";

export function vapidKeys(): VapidKeys | null {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env();
  return VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT
    ? { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT }
    : null;
}

export const pushConfigured = () => vapidKeys() != null;

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string) {
  // Un endpoint pertenece a un solo navegador: si cambia de usuario (otra cuenta en
  // el mismo móvil), pasa al nuevo usuario.
  return prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) },
    select: { id: true },
  });
}

export async function removeSubscription(userId: string, endpoint: string) {
  const { count } = await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return count;
}

type Sender = (target: { endpoint: string; p256dh: string; auth: string }, msg: PushMessage, vapid: VapidKeys) => Promise<SendResult>;

/**
 * Envía a todos los dispositivos del usuario. Las suscripciones que el servicio
 * de push da por muertas (404/410) se borran. Nunca lanza: una notificación no
 * debe romper la operación que la provoca.
 */
export async function sendToUser(userId: string, msg: PushMessage, send: Sender = sendPush) {
  const vapid = vapidKeys();
  if (!vapid) return { sent: 0, removed: 0 };
  let sent = 0;
  let removed = 0;
  try {
    const subs = await prisma.pushSubscription.findMany({ where: { userId } });
    for (const s of subs) {
      const r = await send(s, msg, vapid);
      if (r.ok) {
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date() } });
      } else if (r.gone) {
        removed++;
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      } else {
        console.warn(`[push] envío fallido (${r.status ?? "sin respuesta"}) a ${new URL(s.endpoint).host}`);
      }
    }
  } catch (err) {
    console.error("[push]", err);
  }
  return { sent, removed };
}

/**
 * Notificación de una sola vez por clave (p. ej. "digest:2026-10-06"): primero se
 * anota y después se envía, así dos ejecuciones simultáneas no la duplican.
 */
export async function notifyOnce(userId: string, key: string, msg: PushMessage, send?: Sender): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { userId, key } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false; // ya enviada
    throw err;
  }
  await sendToUser(userId, msg, send);
  return true;
}
