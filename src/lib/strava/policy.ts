/**
 * v1.10 · Datos de Strava: según sus condiciones de API, no se envían a modelos de IA ni se muestran a
 * otras personas. Este filtro deja fuera las sesiones importadas de Strava (y conserva las demás,
 * también las que no tienen origen: en SQL `NOT source = 'STRAVA'` dejaría fuera los NULL).
 */
export const STRAVA = "STRAVA";
export const notFromStrava = { OR: [{ source: null }, { source: { not: STRAVA } }] };
