import { TECHNICAL_EVENT_LABEL } from "@/lib/format";

/** Un intento válido y medido. */
export type MarkRow = { date: string; event: string; implementWeightG: number | null; markM: number; isCompetition: boolean };
export type ImplementBests = {
  key: string;
  label: string;
  top: Array<{ markM: number; date: string; isCompetition: boolean }>;
  /** Mejor marca de cada día (para la gráfica). */
  series: Array<{ date: string; markM: number }>;
};

const grams = (g: number) => (g >= 1000 ? `${String(g / 1000).replace(".", ",")} kg` : `${g} g`);

export function implementKey(event: string, g: number | null): string {
  return `${event}:${g ?? ""}`;
}

export function implementLabel(event: string, g: number | null): string {
  const name = TECHNICAL_EVENT_LABEL[event] ?? event;
  return g ? `${name} · ${grams(g)}` : name;
}

/**
 * Los 3 mejores intentos por implemento (prueba + peso), cada uno de un día
 * distinto, y la mejor marca de cada día. Ordenados por nº de días con marca.
 */
export function implementBests(rows: MarkRow[]): ImplementBests[] {
  const by = new Map<string, { event: string; g: number | null; days: Map<string, { markM: number; isCompetition: boolean }> }>();
  for (const r of rows) {
    if (!(r.markM > 0)) continue;
    const key = implementKey(r.event, r.implementWeightG);
    const entry = by.get(key) ?? { event: r.event, g: r.implementWeightG, days: new Map() };
    const cur = entry.days.get(r.date);
    if (!cur || r.markM > cur.markM) entry.days.set(r.date, { markM: r.markM, isCompetition: r.isCompetition });
    by.set(key, entry);
  }
  return [...by.entries()]
    .map(([key, e]) => {
      const days = [...e.days.entries()].map(([date, v]) => ({ date, ...v }));
      return {
        key,
        label: implementLabel(e.event, e.g),
        top: [...days].sort((a, b) => b.markM - a.markM || (a.date < b.date ? -1 : 1)).slice(0, 3),
        series: days.sort((a, b) => (a.date < b.date ? -1 : 1)).map(({ date, markM }) => ({ date, markM })),
      };
    })
    .sort((a, b) => b.series.length - a.series.length || (a.label < b.label ? -1 : 1));
}
