import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { addDays, today } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";
import { conditionsAt } from "@/lib/weather";

const madridHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(d));

/**
 * Guarda las condiciones (temperatura, viento, lluvia) de la pista a la hora de
 * la sesión técnica. En segundo plano y sin bloquear: si no hay pista en Mis
 * reglas, la fecha es de hace más de 90 días o no hay red, no hace nada.
 */
export async function attachConditions(userId: string, sessionId: string, date: Date, startedAt: string | null | undefined, f: typeof fetch = fetch): Promise<boolean> {
  if (process.env.LIFEOS_NO_WEATHER === "1") return false;
  try {
    const { track } = await getPrefs(userId);
    if (!track || date < addDays(today(), -90) || date > today()) return false;
    const hour = startedAt ? madridHour(new Date(startedAt)) : 18;
    const c = await conditionsAt(track.lat, track.lon, date.toISOString().slice(0, 10), hour, f);
    if (!c) return false;
    await prisma.technicalSession.updateMany({ where: { sessionId, session: { userId } }, data: { conditions: c as unknown as Prisma.InputJsonValue } });
    return true;
  } catch (err) {
    console.warn("[condiciones]", (err as Error).message);
    return false;
  }
}
