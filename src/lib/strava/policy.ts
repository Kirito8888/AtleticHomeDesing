/**
 * v1.10 · Datos de Strava: según sus condiciones de API, no se envían a modelos de IA ni se muestran a
 * otras personas. Este filtro deja fuera las sesiones importadas de Strava (y conserva las demás,
 * también las que no tienen origen: en SQL `NOT source = 'STRAVA'` dejaría fuera los NULL).
 */
export const STRAVA = "STRAVA";
export const notFromStrava = { OR: [{ source: null }, { source: { not: STRAVA } }] };

/** v2.2 · Lo que ve `viewerId` de las sesiones de `ownerId`: la dueña, todo; cualquier otra persona, sin Strava. */
export const visibleTo = (viewerId: string, ownerId: string) => (viewerId === ownerId ? {} : notFromStrava);

/** v2.2 · Marcas personales sin las que salen de una sesión de Strava (las que no tienen sesión se quedan). */
export const prNotFromStrava = { OR: [{ sessionId: null }, { session: notFromStrava }] };

/** v2.2 · ¿Hay actividad de Strava en el periodo? Si la hay, la carga (CTL/ATL) la incluye y no se enseña a terceros. */
export async function hasStravaIn(userId: string, from: Date, to: Date): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.trainingSession.count({ where: { userId, source: STRAVA, date: { gte: from, lte: to } } })) > 0;
}
