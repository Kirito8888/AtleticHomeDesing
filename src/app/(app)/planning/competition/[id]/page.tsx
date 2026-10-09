import Link from "next/link";
import { notFound } from "next/navigation";

import { AttemptSheet } from "@/components/competition/attempt-sheet";
import { CompetitionChecklist } from "@/components/competition/checklist";
import { WarmupTimer } from "@/components/competition/warmup-timer";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum } from "@/lib/format";
import { countdownLabel } from "@/lib/planning/competition";
import { prisma } from "@/lib/prisma";
import { getPrefs } from "@/lib/rules/prefs-service";

export const metadata = { title: "Competición · LifeOS" };

/** Modo competición: cuenta atrás, checklist de la bolsa y hoja de intentos. */
export default async function CompetitionPage({ params }: PageProps<"/planning/competition/[id]">) {
  const user = await pageUser();
  const { id } = await params;
  const ev = await prisma.calendarEvent.findFirst({ where: { id, userId: user.id } });
  if (!ev) notFound();
  const day = toIsoDay(ev.startAt);
  const [prefs, done] = await Promise.all([
    getPrefs(user.id),
    prisma.trainingSession.findMany({
      where: { userId: user.id, date: ev.startAt, technical: { isCompetition: true } },
      select: { id: true, title: true, technical: { select: { bestMarkM: true } } },
    }),
  ]);
  const todayIso = toIsoDay(today());
  return (
    <>
      <PageHeader title={ev.title} description={`${formatDate(ev.startAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${ev.location ? ` · ${ev.location}` : ""}`} />
      <p className="mb-4 text-4xl font-semibold tabular-nums" aria-label="Cuenta atrás">
        {countdownLabel(day, todayIso)}
      </p>
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
            <CardTitle className="text-base">Calentamiento</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <WarmupTimer blocks={prefs.warmupBlocks} />
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
