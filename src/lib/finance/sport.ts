/** Informe de gastos deportivos (puro): por temporada (año natural) y por competición. */
export type SportRow = { date: string; amountCents: number; eventId: string | null; eventTitle: string | null };
export type SportSeason = { season: string; totalCents: number; count: number; byEvent: Array<{ eventId: string | null; title: string; totalCents: number }> };

export function sportReport(rows: SportRow[]): SportSeason[] {
  const seasons = new Map<string, SportRow[]>();
  for (const r of rows) seasons.set(r.date.slice(0, 4), [...(seasons.get(r.date.slice(0, 4)) ?? []), r]);
  return [...seasons.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([season, list]) => {
      const ev = new Map<string, { eventId: string | null; title: string; totalCents: number }>();
      for (const r of list) {
        const key = r.eventId ?? "";
        const cur = ev.get(key) ?? { eventId: r.eventId, title: r.eventTitle ?? "Sin competición (material, licencias…)", totalCents: 0 };
        cur.totalCents += r.amountCents;
        ev.set(key, cur);
      }
      return {
        season,
        totalCents: list.reduce((a, r) => a + r.amountCents, 0),
        count: list.length,
        byEvent: [...ev.values()].sort((a, b) => b.totalCents - a.totalCents),
      };
    });
}
