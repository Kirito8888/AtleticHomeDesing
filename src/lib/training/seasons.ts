// Comparar temporadas (año natural) (v1.6). Puro.
export type SeasonMark = { key: string; markM: number; /** false en tiempos (menor es mejor); por defecto true. */ higherIsBetter?: boolean };
export type SeasonSession = { date: string; sessionRpe: number | null; durationSec: number | null; throws: number; best: SeasonMark | null; /** Marcas extra de la sesión (una por distancia en pista). */ marks?: SeasonMark[] };
export type SeasonInjury = { startedOn: string; resolvedOn: string | null };
export type Season = { season: string; sessions: number; weeklyLoad: number; throws: number; injuryDays: number; bests: Record<string, number> };

const DAY = 864e5;
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function compareSeasons(sessions: SeasonSession[], injuries: SeasonInjury[], today: string): Season[] {
  const years = [...new Set(sessions.map((s) => s.date.slice(0, 4)))].sort().reverse();
  return years.map((season) => {
    const list = sessions.filter((s) => s.date.startsWith(season));
    const start = ms(`${season}-01-01`);
    const end = Math.min(ms(`${season}-12-31`), ms(today));
    const weeks = Math.max(1, Math.round((end - start) / DAY / 7));
    const load = list.reduce((a, s) => a + (s.sessionRpe ?? 0) * Math.round((s.durationSec ?? 0) / 60), 0);
    const bests: Record<string, number> = {};
    for (const s of list) {
      for (const m of [...(s.best ? [s.best] : []), ...(s.marks ?? [])]) {
        const cur = bests[m.key];
        if (cur === undefined || (m.higherIsBetter === false ? m.markM < cur : m.markM > cur)) bests[m.key] = m.markM;
      }
    }
    let injuryDays = 0;
    for (const i of injuries) {
      const a = Math.max(ms(i.startedOn), start);
      const b = Math.min(i.resolvedOn ? ms(i.resolvedOn) : ms(today), end);
      if (b >= a) injuryDays += Math.round((b - a) / DAY) + 1;
    }
    return { season, sessions: list.length, weeklyLoad: Math.round(load / weeks), throws: list.reduce((a, s) => a + s.throws, 0), injuryDays, bests };
  });
}
