// Evolución del 1RM estimado (e1RM) por ejercicio. Función pura de agregación
// + consulta: el e1RM de cada serie ya se guarda al registrar (StrengthSet.est1RmKg).

export interface SetRow {
  exerciseId: string;
  exerciseName: string;
  date: Date;
  est1RmKg: number | null;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
}

export interface E1rmPoint {
  date: string;
  e1rm: number;
  /** Mejor serie del día, para el tooltip: "100 kg × 5". */
  best: string;
}

/** Mejor e1RM por día (sin calentamientos) de un ejercicio, ordenado por fecha. */
export function e1rmSeries(rows: SetRow[], exerciseId: string): E1rmPoint[] {
  const byDay = new Map<string, { e1rm: number; best: string }>();
  for (const r of rows) {
    if (r.exerciseId !== exerciseId || r.isWarmup || r.est1RmKg == null) continue;
    const day = r.date.toISOString().slice(0, 10);
    const cur = byDay.get(day);
    if (!cur || r.est1RmKg > cur.e1rm) {
      byDay.set(day, { e1rm: Math.round(r.est1RmKg * 10) / 10, best: `${r.weightKg} kg × ${r.reps}` });
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
}

/** Ejercicios con datos, los más entrenados primero. */
export function exercisesWithData(rows: SetRow[]): Array<{ id: string; name: string; days: number }> {
  const days = new Map<string, { name: string; days: Set<string> }>();
  for (const r of rows) {
    if (r.isWarmup || r.est1RmKg == null) continue;
    const e = days.get(r.exerciseId) ?? { name: r.exerciseName, days: new Set<string>() };
    e.days.add(r.date.toISOString().slice(0, 10));
    days.set(r.exerciseId, e);
  }
  return [...days.entries()]
    .map(([id, v]) => ({ id, name: v.name, days: v.days.size }))
    .sort((a, b) => b.days - a.days || a.name.localeCompare(b.name));
}

/** Variación entre el primer y el último punto (kg y %). */
export function e1rmChange(series: E1rmPoint[]): { kg: number; pct: number } | null {
  if (series.length < 2) return null;
  const first = series[0].e1rm;
  const last = series.at(-1)!.e1rm;
  return { kg: Math.round((last - first) * 10) / 10, pct: first ? Math.round(((last - first) / first) * 1000) / 10 : 0 };
}
