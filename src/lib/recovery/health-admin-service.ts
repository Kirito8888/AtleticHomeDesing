import "server-only";

import { prisma } from "@/lib/prisma";

/** Citas de los últimos 30 días y las próximas, marcando las ya pasadas. */
export async function recentAppointments(userId: string) {
  const now = Date.now();
  const rows = await prisma.appointment.findMany({ where: { userId, at: { gte: new Date(now - 30 * 864e5) } }, orderBy: { at: "asc" } });
  return rows.map((a) => ({ ...a, past: a.at.getTime() < now }));
}
