import "server-only";

import { prisma } from "@/lib/prisma";

/** v1.8 · Centro de notificaciones: lo enviado (con título) de los últimos 60 días. */
export const unreadCount = (userId: string) => prisma.notificationLog.count({ where: { userId, readAt: null, title: { not: null } } });

export const listInbox = (userId: string, take = 50) =>
  prisma.notificationLog.findMany({ where: { userId, title: { not: null } }, orderBy: { sentAt: "desc" }, take, select: { id: true, title: true, body: true, url: true, sentAt: true, readAt: true, snoozeUntil: true } });

export const markAllRead = (userId: string) => prisma.notificationLog.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
