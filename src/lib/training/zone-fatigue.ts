// Fatiga por zona al cerrar la sesión (v1.6). Puro.
import { z } from "zod";

export const FATIGUE_ZONES = { hombro: "Hombro", codo: "Codo", espalda: "Espalda", cadera: "Cadera", rodilla: "Rodilla", tobillo: "Tobillo" } as const;
export type FatigueZone = keyof typeof FATIGUE_ZONES;
export const zoneFatigueSchema = z.partialRecord(z.enum(Object.keys(FATIGUE_ZONES) as [FatigueZone, ...FatigueZone[]]), z.number().int().min(0).max(10));

/** Media de cada zona en los últimos 14 días frente a los 14 anteriores. */
export function zoneTrend(rows: Array<{ date: string; zones: Partial<Record<FatigueZone, number>> | null }>, today: string) {
  const t = Date.parse(`${today}T00:00:00Z`);
  const recentFrom = t - 13 * 864e5;
  const prevFrom = t - 27 * 864e5;
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return (Object.keys(FATIGUE_ZONES) as FatigueZone[])
    .map((zone) => {
      const recent: number[] = [];
      const prev: number[] = [];
      for (const r of rows) {
        const v = r.zones?.[zone];
        if (v == null) continue;
        const d = Date.parse(`${r.date}T00:00:00Z`);
        if (d >= recentFrom && d <= t) recent.push(v);
        else if (d >= prevFrom && d < recentFrom) prev.push(v);
      }
      return { zone, label: FATIGUE_ZONES[zone], recent: avg(recent), prev: avg(prev), n: recent.length };
    })
    .filter((x) => x.recent != null);
}
