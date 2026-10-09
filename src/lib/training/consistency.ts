/** Consistencia técnica de una sesión: media, mejor, CV y % de nulos (puro). */
export type Consistency = { attempts: number; valid: number; best: number | null; mean: number | null; cvPct: number | null; foulPct: number };

export function consistency(attempts: Array<{ markM: number | null; isFoul: boolean }>): Consistency {
  const marks = attempts.filter((a) => !a.isFoul && a.markM != null && a.markM > 0).map((a) => a.markM!);
  const fouls = attempts.filter((a) => a.isFoul).length;
  const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  if (!marks.length) return { attempts: attempts.length, valid: 0, best: null, mean: null, cvPct: null, foulPct: attempts.length ? r((fouls / attempts.length) * 100, 0) : 0 };
  const mean = marks.reduce((a, b) => a + b, 0) / marks.length;
  const sd = marks.length > 1 ? Math.sqrt(marks.reduce((a, m) => a + (m - mean) ** 2, 0) / (marks.length - 1)) : 0;
  return {
    attempts: attempts.length,
    valid: marks.length,
    best: Math.max(...marks),
    mean: r(mean),
    cvPct: marks.length > 1 ? r((sd / mean) * 100, 1) : null,
    foulPct: r((fouls / attempts.length) * 100, 0),
  };
}
