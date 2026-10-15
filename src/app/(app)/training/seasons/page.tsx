import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatNum, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { bestTimesByDistance, formatSeconds } from "@/lib/training/disciplines";
import { prisma } from "@/lib/prisma";
import { compareSeasons } from "@/lib/training/seasons";

export const metadata = { title: "Temporadas · Atlenza" };

const COMPETITION_THROWS = 6;
/** Últimas temporadas que se comparan (acota la consulta). */
const SEASONS_SHOWN = 6;

export default async function SeasonsPage() {
  const user = await pageUser();
  const [sessions, injuries] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId: user.id, status: "COMPLETED", date: { gte: new Date(Date.UTC(new Date().getUTCFullYear() - SEASONS_SHOWN + 1, 0, 1)) } },
      select: { date: true, sessionRpe: true, durationSec: true, track: { select: { modality: true, intervals: { select: { distanceM: true, timeSec: true } } } }, technical: { select: { event: true, implementWeightG: true, bestMarkM: true, isCompetition: true, _count: { select: { attempts: true } } } } },
    }),
    prisma.injury.findMany({ where: { userId: user.id }, select: { startedOn: true, resolvedOn: true } }),
  ]);
  const seasons = compareSeasons(
    sessions.map((s) => ({
      date: toIsoDay(s.date),
      sessionRpe: s.sessionRpe,
      durationSec: s.durationSec,
      throws: s.technical ? s.technical._count.attempts || (s.technical.isCompetition ? COMPETITION_THROWS : 0) : 0,
      marks: s.track && ["SPRINT", "HURDLES", "RUN"].includes(s.track.modality) ? bestTimesByDistance(s.track.intervals).map((b) => ({ key: `track|${b.distanceM}`, markM: b.timeSec, higherIsBetter: false })) : [],
      best: s.technical?.bestMarkM ? { key: `${s.technical.event}|${s.technical.implementWeightG ?? ""}`, markM: s.technical.bestMarkM } : null,
    })),
    injuries.map((i) => ({ startedOn: toIsoDay(i.startedOn), resolvedOn: i.resolvedOn ? toIsoDay(i.resolvedOn) : null })),
    toIsoDay(today()),
  );
  const keys = [...new Set(seasons.flatMap((s) => Object.keys(s.bests)))].sort();
  const label = (k: string) => {
    const [ev, g] = k.split("|");
    if (ev === "track") return `${formatNum(Number(g))} m`;
    return `${TECHNICAL_EVENT_LABEL[ev] ?? ev}${g ? ` ${g} g` : ""}`;
  };
  return (
    <>
      <PageHeader title="Comparar temporadas" description="Año contra año: volumen, lanzamientos, molestias y mejores marcas y tiempos." />
      {seasons.length ? (
        <Card className="py-3">
          <CardContent className="overflow-x-auto px-4">
            <table className="w-full text-sm tabular-nums" aria-label="Temporadas">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 text-left font-normal">Temporada</th>
                  {seasons.map((s) => (
                    <th key={s.season} className="py-1 pl-3 text-right font-normal">
                      {s.season}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Sesiones", (s: (typeof seasons)[number]) => String(s.sessions)],
                    ["Carga semanal media (UA)", (s: (typeof seasons)[number]) => String(s.weeklyLoad)],
                    ...(seasons.some((s) => s.throws > 0) ? ([["Lanzamientos", (s: (typeof seasons)[number]) => String(s.throws)]] as const) : []),
                    ["Días con molestias", (s: (typeof seasons)[number]) => String(s.injuryDays)],
                  ] as const
                ).map(([name, get]) => (
                  <tr key={name} className="border-t">
                    <td className="py-1 pr-3">{name}</td>
                    {seasons.map((s) => (
                      <td key={s.season} className="py-1 pl-3 text-right">
                        {get(s)}
                      </td>
                    ))}
                  </tr>
                ))}
                {keys.map((k) => (
                  <tr key={k} className="border-t">
                    <td className="py-1 pr-3">Mejor · {label(k)}</td>
                    {seasons.map((s) => (
                      <td key={s.season} className="py-1 pl-3 text-right">
                        {s.bests[k] ? (k.startsWith("track|") ? formatSeconds(s.bests[k]) : `${formatNum(s.bests[k], 2)} m`) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay sesiones registradas.</p>
      )}
    </>
  );
}
