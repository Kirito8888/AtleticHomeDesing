import Link from "next/link";
import { notFound } from "next/navigation";

import { AttemptSheet } from "@/components/competition/attempt-sheet";
import { CompetitionChecklist } from "@/components/competition/checklist";
import { AttemptSimulator, CombinedWarmups } from "@/components/competition/competition-tools";
import { WarmupTimer } from "@/components/competition/warmup-timer";
import { TaperCard } from "@/components/competition/taper-card";
import { CompMeals } from "@/components/competition/comp-meals";
import { mealNow } from "@/lib/nutrition/kitchen";
import { minutesUntil } from "@/lib/planning/competition";
import { taperProposal } from "@/lib/planning/taper-service";
import { supplementsToCheck } from "@/lib/recovery/health-admin";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum } from "@/lib/format";
import { countdownLabel } from "@/lib/planning/competition";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";
import { TripPlace } from "@/components/competition/trip-place";
import { diffDays } from "@/lib/dates";
import { dayForecast, forecastTips } from "@/lib/weather";

export const metadata = { title: "Competición · Atlenza" };

/** Modo competición: cuenta atrás, checklist de la bolsa y hoja de intentos. */
export default async function CompetitionPage({ params }: PageProps<"/planning/competition/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const ev = await prisma.calendarEvent.findFirst({ where: { id, userId: user.id } });
  if (!ev) notFound();
  const day = toIsoDay(ev.startAt);
  const [prefs, done, taper] = await Promise.all([
    getPrefs(user.id),
    prisma.trainingSession.findMany({
      where: { userId: user.id, date: ev.startAt, technical: { isCompetition: true } },
      select: { id: true, title: true, technical: { select: { bestMarkM: true } } },
    }),
    ev.type === "COMPETITION" ? taperProposal(user.id, ev.id) : null,
  ]);
  const supps = await prisma.supplement.findMany({ where: { userId: user.id }, select: { id: true, name: true, endedOn: true, checkedOn: true } });
  const toCheck = supplementsToCheck(
    supps.map((s) => ({ ...s, endedOn: s.endedOn ? toIsoDay(s.endedOn) : null, checkedOn: s.checkedOn ? toIsoDay(s.checkedOn) : null })),
    toIsoDay(today()),
  );
  const todayIso = toIsoDay(today());
  // v1.8 · Viaje: pronóstico del día (Open-Meteo, hasta 16 días antes) y el viaje de Finanzas si existe
  const daysTo = diffDays(ev.startAt, today());
  const [forecast, trip] = await Promise.all([
    ev.lat != null && ev.lon != null && daysTo >= 0 && daysTo <= 15 && process.env.LIFEOS_NO_WEATHER !== "1" ? dayForecast(ev.lat, ev.lon, day) : null,
    prisma.trip.findFirst({ where: { userId: user.id, eventId: ev.id }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title={ev.title} description={`${formatDate(ev.startAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${ev.location ? ` · ${ev.location}` : ""}`} />
      <p className="mb-4 text-4xl font-semibold tabular-nums" aria-label="Cuenta atrás">
        {countdownLabel(day, todayIso)}
      </p>
      {toCheck.length ? (
        <Link href="/recovery/health" role="status" className="mb-4 block rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
          Antes de competir, comprueba en la lista oficial: {toCheck.map((s) => s.name).join(", ")}.
        </Link>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">La bolsa</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <CompetitionChecklist eventId={ev.id} items={prefs.checklist} />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Viaje y tiempo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            {forecast ? (
              <div aria-label="Pronóstico del día">
                <p className="font-medium">
                  {forecast.minC != null ? `${Math.round(forecast.minC)}–` : ""}
                  {forecast.maxC != null ? `${Math.round(forecast.maxC)} °C` : "—"}
                  {forecast.rainProb != null ? ` · lluvia ${forecast.rainProb} %` : ""}
                  {forecast.windMaxMs != null ? ` · viento hasta ${formatNum(forecast.windMaxMs, 1)} m/s` : ""}
                </p>
                {forecastTips(forecast).length ? (
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {forecastTips(forecast).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : ev.lat != null ? (
              <p className="text-muted-foreground">{daysTo > 15 ? "El pronóstico aparece 16 días antes." : daysTo < 0 ? "La competición ya pasó." : "Pronóstico no disponible ahora."}</p>
            ) : null}
            <TripPlace eventId={ev.id} lat={ev.lat} lon={ev.lon} />
            {trip ? (
              <Link href="/finance/trips" className="underline underline-offset-2">
                Presupuesto del viaje: {trip.name}
              </Link>
            ) : (
              <Link href="/finance/trips" className="text-muted-foreground underline underline-offset-2">
                Preparar el presupuesto del viaje en Finanzas
              </Link>
            )}
          </CardContent>
        </Card>
        {taper && day > toIsoDay(today()) ? (
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Afinamiento{taper.priority === "A" ? " (competición A)" : ""}</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <TaperCard eventId={ev.id} pct={taper.pct} nDays={taper.nDays} days={taper.days} applied={taper.applied} />
            </CardContent>
          </Card>
        ) : null}
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Comida del día</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <CompMeals meals={prefs.compMeals} current={!ev.allDay ? mealNow(minutesUntil(ev.startAt)) : null} />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Calentamiento</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <WarmupTimer blocks={prefs.warmupBlocks} />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Simulador de intentos</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <AttemptSimulator start={!ev.allDay ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ev.startAt) : null} />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Pruebas combinadas</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <CombinedWarmups />
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Hoja de intentos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4">
            {done.length ? (
              <ul className="grid gap-1 text-sm">
                {done.map((s) => (
                  <li key={s.id}>
                    ✔{" "}
                    <Link href={`/training/${s.id}`} className="underline underline-offset-2">
                      {s.title ?? "Competición"} registrada
                    </Link>
                    {s.technical?.bestMarkM != null ? ` · mejor ${formatNum(s.technical.bestMarkM, 2)} m` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {day <= todayIso ? (
              <AttemptSheet date={day} title={ev.title} />
            ) : (
              <p className="text-sm text-muted-foreground">La hoja de intentos se abre el día de la competición.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
