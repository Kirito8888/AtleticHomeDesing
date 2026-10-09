/**
 * Índice tipo Hooper (4–20, más alto = peor): sueño, fatiga, estrés y agujetas,
 * cada uno en 1–5 a partir de los campos de Recuperación. Inspirado en Hooper y
 * Mackinnon (1995); no es el cuestionario original de 7 puntos.
 */
export function hooperIndex(m: { sleepQuality: number | null; fatigue: number | null; stress: number | null; doms: number | null }): number | null {
  if (m.sleepQuality == null || m.fatigue == null || m.stress == null || m.doms == null) return null;
  const sleep = 6 - m.sleepQuality; // 5 = excelente → 1
  const doms = 1 + Math.round((m.doms / 10) * 4); // 0–10 → 1–5
  return sleep + m.fatigue + m.stress + doms;
}

/** Deuda de sueño de los últimos 7 días (solo cuenta los días registrados por debajo del objetivo). */
export function sleepDebt(days: Array<{ date: string; sleepHours: number | null }>, today: string, target: number): { debtH: number; nights: number } {
  const since = Date.parse(`${today}T00:00:00Z`) - 6 * 864e5;
  const recent = days.filter((d) => d.sleepHours != null && Date.parse(`${d.date}T00:00:00Z`) >= since && d.date <= today);
  const debt = recent.reduce((a, d) => a + Math.max(0, target - d.sleepHours!), 0);
  return { debtH: Math.round(debt * 10) / 10, nights: recent.length };
}
