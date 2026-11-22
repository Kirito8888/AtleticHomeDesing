/**
 * v1.10 · Datos de Strava: según sus condiciones de API, no se envían a modelos de IA ni se muestran a
 * otras personas. v3.1 · Lo mismo para los entrenos de Apple Fitness importados «como sesión aparte»
 * (`APPLE_FITNESS`): llegan del reloj sin revisión previa de la entrenadora y no se comparten.
 * Este filtro deja fuera las sesiones de esos orígenes (y conserva las demás, también las que no
 * tienen origen: en SQL `NOT source = 'STRAVA'` dejaría fuera los NULL). Un entreno de Apple
 * *fusionado* en una sesión propia conserva `source = null`: pasa a ser de la usuaria.
 */
export const STRAVA = "STRAVA";
export const APPLE_FITNESS = "APPLE_FITNESS";
/** Orígenes privados de su dueña: nunca a la IA ni a otras personas. Ampliar aquí al añadir otro. */
export const PRIVATE_SOURCES = [STRAVA, APPLE_FITNESS];
export const isPrivateSource = (source: string | null | undefined) => source != null && PRIVATE_SOURCES.includes(source);
/** Solo las sesiones sin origen o de un origen no privado (el nombre se conserva por historia: cubre todos los orígenes privados). */
export const notFromStrava = { OR: [{ source: null }, { source: { notIn: PRIVATE_SOURCES } }] };
/** Solo las sesiones de un origen privado. */
export const fromPrivateSource = { source: { in: PRIVATE_SOURCES } };

/** v2.2 · Lo que ve `viewerId` de las sesiones de `ownerId`: la dueña, todo; cualquier otra persona, sin orígenes privados. */
export const visibleTo = (viewerId: string, ownerId: string) => (viewerId === ownerId ? {} : notFromStrava);

/** v2.2 · Marcas personales sin las que salen de una sesión de origen privado (las que no tienen sesión se quedan). */
export const prNotFromStrava = { OR: [{ sessionId: null }, { session: notFromStrava }] };

/** v2.2 · ¿Hay actividad de origen privado en el periodo? Si la hay, la carga (CTL/ATL) la incluye y no se enseña a terceros. */
export async function hasStravaIn(userId: string, from: Date, to: Date): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.trainingSession.count({ where: { userId, ...fromPrivateSource, date: { gte: from, lte: to } } })) > 0;
}
