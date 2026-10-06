/** Cumplimiento del plan por semana: hecho, saltado, perdido y pendiente. Pura. */
export type ComplianceDay = { week: number | null; date: string | null; status: "PLANNED" | "COMPLETED" | "SKIPPED" | null };
export type WeekCompliance = { week: number; planned: number; done: number; skipped: number; missed: number; pending: number; pct: number | null };

export function compliance(days: ComplianceDay[], today: string): { weeks: WeekCompliance[]; total: WeekCompliance } {
  const byWeek = new Map<number, WeekCompliance>();
  const total: WeekCompliance = { week: 0, planned: 0, done: 0, skipped: 0, missed: 0, pending: 0, pct: null };
  for (const d of days) {
    if (d.week == null || !d.status) continue;
    const w = byWeek.get(d.week) ?? { week: d.week, planned: 0, done: 0, skipped: 0, missed: 0, pending: 0, pct: null };
    for (const t of [w, total]) {
      t.planned++;
      if (d.status === "COMPLETED") t.done++;
      else if (d.status === "SKIPPED") t.skipped++;
      else if (d.date && d.date < today) t.missed++;
      else t.pending++;
    }
    byWeek.set(d.week, w);
  }
  // % sobre los días que ya tocaban (hechos + saltados + perdidos).
  const pct = (w: WeekCompliance) => {
    const due = w.done + w.skipped + w.missed;
    return due ? Math.round((w.done / due) * 100) : null;
  };
  const weeks = [...byWeek.values()].sort((a, b) => a.week - b.week).map((w) => ({ ...w, pct: pct(w) }));
  return { weeks, total: { ...total, pct: pct(total) } };
}
