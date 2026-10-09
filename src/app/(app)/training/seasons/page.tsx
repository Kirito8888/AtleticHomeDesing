import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatNum, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { compareSeasons } from "@/lib/training/seasons";

export const metadata = { title: "Temporadas · LifeOS" };

const COMPETITION_THROWS = 6;

export default async function SeasonsPage() {
  const user = await pageUser();
  const [sessions, injuries] = await Promise.all([
    prisma.trainingSession.findMany({
      where: { userId: user.id, status: "COMPLETED" },
      select: { date: true, sessionRpe: true, durationSec: true, technical: { select: { event: true, implementWeightG: true, bestMarkM: true, isCompetition: true, _count: { select: { attempts: true } } } } },
    }),
    prisma.injury.findMany({ where: { userId: user.id }, select: { startedOn: true, resolvedOn: true } }),
  ]);
  const seasons = compareSeasons(
    sessions.map((s) => ({
      date: toIsoDay(s.date),
      sessionRpe: s.sessionRpe,
      durationSec: s.durationSec,
      throws: s.technical ? s.technical._count.attempts || (s.technical.isCompetition ? COMPETITION_THROWS : 0) : 0,
      best: s.technical?.bestMarkM ? { key: `${s.technical.event}|${s.technical.implementWeightG ?? ""}`, markM: s.technical.bestMarkM } : null,
    })),
    injuries.map((i) => ({ startedOn: toIsoDay(i.startedOn), resolvedOn: i.resolvedOn ? toIsoDay(i.resolvedOn) : null })),
    toIsoDay(today()),
  );
  const keys = [...new Set(seasons.flatMap((s) => Object.keys(s.bests)))].sort();
  const label = (k: string) => {
    const [ev, g] = k.split("|");
    return `${TECHNICAL_EVENT_LABEL[ev] ?? ev}${g ? ` ${g} g` : ""}`;
  };
  return (
    <>
      <PageHeader title="Comparar temporadas" description="Año contra año: volumen, lanzamientos, molestias y mejores marcas." />
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
                    ["Lanzamientos", (s: (typeof seasons)[number]) => String(s.throws)],
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
                        {s.bests[k] ? `${formatNum(s.bests[k], 2)} m` : "—"}
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
