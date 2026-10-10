import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { DeleteStudy, Pomodoro } from "@/components/study/pomodoro";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, dateOnly, startOfIsoWeek, today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { studyWeek } from "@/lib/study/schedule";
import { todayBlocks } from "@/lib/study/exam-plan-service";
import { knownSubjects } from "@/lib/study/schedule-service";
import { focusStats } from "@/lib/study/coursework-service";

export const metadata = { title: "Pomodoro · Atlenza" };

const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim() : `${m} min`);

export default async function FocusPage({ searchParams }: PageProps<"/study/focus">) {
  const user = await pageUser();
  const { week: raw } = await searchParams;
  const weekStart = startOfIsoWeek(typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? dateOnly(raw) : today());
  const ws = toIsoDay(weekStart);
  const [subjects, rows, plan, focus] = await Promise.all([
    knownSubjects(user.id),
    prisma.studySession.findMany({ where: { userId: user.id, date: { gte: weekStart, lte: addDays(weekStart, 6) } }, orderBy: { createdAt: "desc" } }),
    todayBlocks(user.id, toIsoDay(today())),
    focusStats(user.id, toIsoDay(today())),
  ]);
  const w = studyWeek(rows.map((r) => ({ ...r, date: toIsoDay(r.date) })), ws);
  const max = Math.max(60, ...w.days.map((d) => d.minutes));

  return (
    <>
      <PageHeader title="Pomodoro" description="Estudia por bloques; cada bloque terminado se anota en su asignatura" />
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit gap-3 py-4">
          <CardContent className="px-4">
            <Pomodoro subjects={subjects} />
            {plan.length ? (
              <div className="mt-4 grid gap-1 border-t pt-3 text-sm" aria-label="Hoy toca">
                <p className="font-medium">
                  Hoy toca ·{" "}
                  <Link href="/study/exams" className="text-xs font-normal underline underline-offset-2">
                    plan de estudio
                  </Link>
                </p>
                {plan.map((b) => (
                  <p key={b.id} className={b.done ? "text-muted-foreground line-through" : undefined}>
                    {b.subject} · {hm(b.minutes)}
                  </p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="flex flex-row items-center justify-between px-4">
            <Button asChild variant="ghost" size="icon" aria-label="Semana anterior">
              <Link href={`?week=${toIsoDay(addDays(weekStart, -7))}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <CardTitle className="text-sm">
              Semana del {formatDate(ws, { day: "numeric", month: "short" })} · {hm(w.total)}
            </CardTitle>
            <Button asChild variant="ghost" size="icon" aria-label="Semana siguiente">
              <Link href={`?week=${toIsoDay(addDays(weekStart, 7))}`}>
                <ChevronRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 px-4 text-sm">
            <figure aria-label="Minutos de estudio por día" className="grid h-36 grid-cols-7 items-end gap-2">
              {w.days.map((d) => (
                <div key={d.date} className="flex h-full flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-muted-foreground tabular-nums">{d.minutes || ""}</span>
                  <div className="w-full rounded-t bg-primary" style={{ height: `${(d.minutes / max) * 100}%` }} title={`${d.minutes} min`} />
                  <span className="text-xs text-muted-foreground">{formatDate(d.date, { weekday: "narrow" })}</span>
                </div>
              ))}
            </figure>
            {w.subjects.length ? (
              <ul className="grid gap-1" aria-label="Horas por asignatura">
                {w.subjects.map((s) => (
                  <li key={s.subject} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{s.subject}</span>
                    <span className="shrink-0 font-medium tabular-nums">{hm(s.minutes)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Sin estudio anotado esta semana.</p>
            )}
            {rows.length ? (
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">Bloques de la semana ({rows.length})</summary>
                <ul className="mt-2 grid gap-1 text-xs">
                  {rows.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {formatDate(r.date, { weekday: "short", day: "numeric" })} · {r.subject} · {r.minutes} min
                      </span>
                      <DeleteStudy id={r.id} label={`${r.minutes} min de ${r.subject}`} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4 gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Cuándo te concentras mejor (60 días)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 px-4 text-sm">
          {focus.total ? (
            <>
              <ul className="grid gap-1" aria-label="Estudio por franja">
                {focus.slots.map((s) => (
                  <li key={s.key} className="flex justify-between gap-2 tabular-nums">
                    <span>{s.label}</span>
                    <span>
                      {hm(s.minutes)} · {s.sessions} bloques{s.sessions ? ` · ${s.avg} min de media` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                {focus.best ? `Tus bloques más largos salen por la ${focus.best.label.split(" (")[0].toLowerCase()}: reserva ahí lo más difícil.` : "Con 3 bloques o más en una franja te diré cuál te rinde más."} El inicio se calcula como la hora en que guardaste el bloque menos su duración.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Usa el pomodoro unos días y aquí verás en qué franja rindes más.</p>
          )}
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        ¿Clases y exámenes?{" "}
        <Link href="/study/schedule" className="underline underline-offset-2">
          Horario
        </Link>
        .
      </p>
    </>
  );
}
