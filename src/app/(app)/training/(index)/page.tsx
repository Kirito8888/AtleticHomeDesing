import Link from "next/link";
import { CalendarClock, Plus, Trophy } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { TrainingShortcuts } from "@/components/training/training-shortcuts";
import { WeekStrip } from "@/components/training/week-strip";
import { addDays, startOfIsoWeek, today, toIsoDay } from "@/lib/dates";
import { throwWeeks } from "@/lib/rules/rules-service";
import { familyOf, sessionHeadline } from "@/lib/training/disciplines";
import { trainingHubSections } from "@/lib/training/hub-links";
import { weekGrid } from "@/lib/training/week";
import { formatDate, formatDuration, formatNum, SESSION_TYPE_LABEL, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { cyclePredictions } from "@/lib/health/cycle-service";

export const metadata = { title: "Entrenamiento · Atlenza" };

export default async function TrainingPage() {
  const user = await pageUser();
  const now = today();
  const monday = startOfIsoWeek(now);
  const [sessions, records, upcoming, weekSessions, throwsInfo, profile] = await Promise.all([
    // Historial: hasta hoy. Lo planificado a futuro va aparte (el plan importado son cientos de días).
    prisma.trainingSession.findMany({
      where: { userId: user.id, date: { lte: now } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 40,
      include: {
        track: { select: { modality: true, distanceM: true, avgPaceSecPerKm: true, intervals: { select: { distanceM: true, timeSec: true } } } },
        technical: { select: { event: true, implementWeightG: true, bestMarkM: true } },
        strength: { select: { tonnageKg: true, _count: { select: { sets: true } } } },
      },
    }),
    prisma.personalRecord.findMany({
      where: { userId: user.id },
      orderBy: { achievedOn: "desc" },
      take: 6,
      include: { exercise: { select: { name: true } } },
    }),
    prisma.trainingSession.findMany({
      where: { userId: user.id, status: "PLANNED", date: { gt: now, lte: addDays(now, 7) } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, date: true, title: true, type: true, durationSec: true },
    }),
    prisma.trainingSession.findMany({ where: { userId: user.id, date: { gte: monday, lte: addDays(monday, 6) } }, select: { date: true, status: true, track: { select: { distanceM: true, intervals: { select: { distanceM: true } } } }, technical: { select: { _count: { select: { attempts: true } } } } } }),
    throwWeeks(user.id, toIsoDay(now)),
    prisma.athleteProfile.findUnique({ where: { userId: user.id }, select: { primaryDiscipline: true, primaryEvent: true } }),
  ]);
  // Días previstos de regla o síntomas (solo para ella; cálculo local).
  const predicted = new Map((await cyclePredictions(user.id, toIsoDay(now), toIsoDay(addDays(now, 7)))).map((p) => [p.date, p]));
  const week = weekGrid(
    weekSessions.map((s) => ({ date: toIsoDay(s.date), status: s.status })),
    toIsoDay(monday),
    toIsoDay(now),
  );

  // v2.1 · la línea de la semana depende de la prueba (lanzamientos: tope de lanzamientos, como siempre)
  const family = familyOf(profile?.primaryDiscipline, profile?.primaryEvent);
  const done = weekSessions.filter((s) => s.status === "COMPLETED");
  const weekMeters = done.reduce((a, s) => a + (s.track ? (s.track.distanceM ?? s.track.intervals.reduce((x, i) => x + (i.distanceM ?? 0), 0)) : 0), 0);
  const weekJumps = done.reduce((a, s) => a + (s.technical?._count.attempts ?? 0), 0);
  const weekMetric =
    family === "throws" ? undefined : family === "jumps" ? (weekJumps ? `Intentos esta semana: ${weekJumps}` : null) : weekMeters ? `Distancia esta semana: ${formatNum(weekMeters / 1000, 1)} km` : null;

  return (
    <>
      <PageHeader
        title="Entrenamiento"
        action={
          <Button asChild size="sm">
            <Link href="/training/new">
              <Plus /> Sesión
            </Link>
          </Button>
        }
      />

      <WeekStrip days={week} today={toIsoDay(now)} throws={throwsInfo.weeks.at(-1)?.throws ?? 0} cap={throwsInfo.cap} metric={weekMetric} />

      {upcoming.length ? (
        <Card className="mb-4 gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarClock className="size-4 text-muted-foreground" /> Próximos 7 días
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ul className="grid gap-1.5">
              {upcoming.map((s) => (
                <li key={s.id}>
                  <Link href={`/training/${s.id}`} className="flex items-center gap-3 rounded-md px-1 py-1 text-sm hover:bg-accent">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground capitalize">{formatDate(s.date, { weekday: "short", day: "numeric" })}</span>
                    <span className="min-w-0 flex-1 truncate">{s.title ?? SESSION_TYPE_LABEL[s.type]}</span>
                    {predicted.get(toIsoDay(s.date)) ? (
                      <span className="shrink-0 text-xs text-rose-600 dark:text-rose-400" title="Solo tú lo ves">
                        {predicted.get(toIsoDay(s.date))!.period ? "● regla prevista" : "◦ síntomas previstos"}
                      </span>
                    ) : null}
                    {s.durationSec ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">~{Math.round(s.durationSec / 60)} min</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <TrainingShortcuts sections={trainingHubSections(family)} />

      {records.length ? (
        <Card className="mb-4 gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy className="size-4 text-muted-foreground" /> Últimas marcas personales
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3">
            {records.map((r) => (
              <div key={r.id} className="min-w-0">
                <div className="truncate text-xs text-muted-foreground">
                  {r.kind === "ONE_RM"
                    ? `${r.exercise?.name ?? "Ejercicio"} · 1RM${r.isEstimated ? " est." : ""}`
                    : `${TECHNICAL_EVENT_LABEL[r.technicalEvent ?? "OTHER"]}${r.implementWeightG ? ` ${r.implementWeightG} g` : ""}`}
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatNum(r.value, 2)} {r.kind === "ONE_RM" ? "kg" : r.kind === "TRACK_TIME" ? "s" : "m"}
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(r.achievedOn)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <h2 className="mb-2 text-base font-semibold">Historial</h2>
      {sessions.length ? (
        <ul className="grid gap-2">
          {sessions.map((s) => {
            const detail = sessionHeadline({
              technical: s.technical,
              strength: s.strength ? { tonnageKg: s.strength.tonnageKg, setCount: s.strength._count.sets } : null,
              track: s.track,
            });
            return (
              <li key={s.id}>
                <Link href={`/training/${s.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent">
                  <div className="w-12 shrink-0 text-center text-xs text-muted-foreground">{formatDate(s.date)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.title ?? SESSION_TYPE_LABEL[s.type]}</span>
                      {s.status !== "COMPLETED" ? <Badge variant="outline">{s.status === "PLANNED" ? "Planificada" : "Omitida"}</Badge> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{detail || formatDuration(s.durationSec)}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold tabular-nums">{s.tss != null ? formatNum(s.tss) : "—"}</div>
                    <div className="text-[10px] text-muted-foreground">TSS</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Card>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            Aún no hay sesiones.
            <Button asChild className="w-fit">
              <Link href="/training/new">Registrar la primera</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
