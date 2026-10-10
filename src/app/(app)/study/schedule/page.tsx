import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { ClassForm, DeleteSlot } from "@/components/study/schedule-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { fromMin, WEEKDAY_NAMES } from "@/lib/study/schedule";
import { upcomingExamClashes } from "@/lib/study/schedule-service";

export const metadata = { title: "Horario · Atlenza" };

export default async function SchedulePage() {
  const user = await pageUser();
  const todayIso = toIsoDay(today());
  const { slots, clashes } = await upcomingExamClashes(user.id, todayIso);
  const classes = slots.filter((s) => s.kind === "CLASS" && (!s.validTo || s.validTo >= todayIso));
  const exams = slots.filter((s) => s.kind === "EXAM" && s.date && s.date >= todayIso).sort((a, b) => a.date!.localeCompare(b.date!));
  const time = (s: { startMin: number; endMin: number }) => `${fromMin(s.startMin)}–${fromMin(s.endMin)}`;

  return (
    <>
      <PageHeader title="Horario y exámenes" description="Tus clases y exámenes, cruzados con los entrenos planificados" />
      {clashes.length ? (
        <section aria-label="Choques con exámenes" className="mb-4 grid gap-2">
          {clashes.map((c) => (
            <Link key={c.id} href={`/training/${c.id}`} role="status" className="block rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
              📚 «{c.title}» {c.kind === "EXAM" ? "cae el mismo día" : "es la víspera"} del examen de {c.subject} ({formatDate(c.date, { weekday: "short", day: "numeric", month: "short" })}).{" "}
              {c.kind === "EXAM" ? "Valora moverla o hacerla suave." : "Si es exigente, valora moverla para llegar con energía al examen."}
            </Link>
          ))}
        </section>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Añadir</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ClassForm today={todayIso} />
          </CardContent>
        </Card>
        <div className="grid h-fit gap-4">
          <Card className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Próximos exámenes</CardTitle>
            </CardHeader>
            <CardContent className="px-4 text-sm">
              {exams.length ? (
                <ul className="grid gap-1" aria-label="Exámenes">
                  {exams.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{e.subject}</span> · {formatDate(e.date!, { weekday: "short", day: "numeric", month: "short" })} · {time(e)}
                        {e.location ? ` · ${e.location}` : ""}
                      </span>
                      <DeleteSlot id={e.id} label={`examen de ${e.subject}`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Sin exámenes apuntados.</p>
              )}
            </CardContent>
          </Card>
          <Card className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Clases de la semana</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4 text-sm">
              {classes.length ? (
                WEEKDAY_NAMES.map((name, wd) => {
                  const list = classes.filter((c) => c.weekday === wd).sort((a, b) => a.startMin - b.startMin);
                  return list.length ? (
                    <div key={name}>
                      <h3 className="mb-1 text-xs font-medium text-muted-foreground">{name}</h3>
                      <ul className="grid gap-1">
                        {list.map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate">
                              <span className="tabular-nums">{time(c)}</span> · {c.subject}
                              {c.location ? ` · ${c.location}` : ""}
                            </span>
                            <DeleteSlot id={c.id} label={`clase de ${c.subject} del ${name.toLowerCase()}`} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null;
                })
              ) : (
                <p className="text-muted-foreground">Sin clases apuntadas.</p>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Las clases y exámenes también salen en el calendario de{" "}
            <Link href="/planning" className="underline underline-offset-2">
              Planificación
            </Link>
            . Para estudiar con temporizador, usa el{" "}
            <Link href="/study/focus" className="underline underline-offset-2">
              pomodoro
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
