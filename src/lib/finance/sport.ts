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

export type SportMove = { date: string; amountCents: number; kind: "INCOME" | "EXPENSE" };
export type SportBalance = {
  season: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  /** Solo la temporada en curso: gasto al ritmo actual hasta el 31 de diciembre y saldo resultante (con los ingresos ya cobrados). */
  forecast: { expenseCents: number; balanceCents: number } | null;
};

/** Becas, premios y patrocinios frente a gastos deportivos, por temporada (año natural). */
export function sportBalance(rows: SportMove[], today: string): SportBalance[] {
  const seasons = new Map<string, SportMove[]>();
  for (const r of rows) seasons.set(r.date.slice(0, 4), [...(seasons.get(r.date.slice(0, 4)) ?? []), r]);
  const year = today.slice(0, 4);
  const start = Date.UTC(Number(year), 0, 1);
  const elapsed = Math.floor((Date.parse(`${today}T00:00:00Z`) - start) / 86_400_000) + 1;
  const length = (Date.UTC(Number(year) + 1, 0, 1) - start) / 86_400_000;
  return [...seasons.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([season, list]) => {
      const incomeCents = list.filter((r) => r.kind === "INCOME").reduce((a, r) => a + r.amountCents, 0);
      const expenseCents = list.filter((r) => r.kind === "EXPENSE").reduce((a, r) => a + r.amountCents, 0);
      // Con menos de un mes de datos la proyección no dice nada
      const forecastExp = season === year && elapsed >= 30 ? Math.round((expenseCents * length) / elapsed) : null;
      return {
        season,
        incomeCents,
        expenseCents,
        balanceCents: incomeCents - expenseCents,
        forecast: forecastExp != null ? { expenseCents: forecastExp, balanceCents: incomeCents - forecastExp } : null,
      };
    });
}
