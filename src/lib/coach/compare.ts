// Panel de entrenadora: comparativa de atletas (v1.6). Puro. Cada dato solo si el atleta dio ese permiso.
export type AthleteRow = {
  id: string;
  name: string;
  scopes: string[];
  sessions: Array<{ date: string; status: string; sessionRpe: number | null; durationSec: number | null; bestMarkM: number | null }>;
};

export function compareAthletes(rows: AthleteRow[], today: string) {
  const t = Date.parse(`${today}T00:00:00Z`);
  const within = (d: string, n: number) => {
    const x = Date.parse(`${d}T00:00:00Z`);
    return x <= t && x > t - n * 864e5;
  };
  return rows.map((a) => {
    const can = (s: string) => a.scopes.includes(s);
    const last7 = a.sessions.filter((s) => s.status === "COMPLETED" && within(s.date, 7));
    const due = a.sessions.filter((s) => within(s.date, 14) && s.date < today && s.status !== "SKIPPED");
    const done = due.filter((s) => s.status === "COMPLETED").length;
    const marks = a.sessions.filter((s) => s.bestMarkM && within(s.date, 30)).map((s) => s.bestMarkM!);
    return {
      id: a.id,
      name: a.name,
      load7: can("LOAD") ? last7.reduce((x, s) => x + (s.sessionRpe ?? 0) * Math.round((s.durationSec ?? 0) / 60), 0) : null,
      compliancePct: can("SESSIONS") && due.length ? Math.round((done / due.length) * 100) : null,
      best30: can("LOAD") && marks.length ? Math.max(...marks) : null,
    };
  });
}
