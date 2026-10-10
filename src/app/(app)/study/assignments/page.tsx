import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AssignmentActions, AssignmentForm } from "@/components/study/coursework";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum } from "@/lib/format";
import { knownSubjects } from "@/lib/study/schedule-service";
import { assignmentsView } from "@/lib/study/coursework-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Trabajos y entregas · LifeOS" };

/** v1.7 · Trabajos y entregas con avisos, estado y nota media ponderada. */
export default async function AssignmentsPage() {
  const user = await pageUser();
  const day = toIsoDay(today());
  const [v, subjects] = await Promise.all([assignmentsView(user.id, day), knownSubjects(user.id)]);
  return (
    <>
      <PageHeader title="Trabajos y entregas" description="Qué hay que entregar, cuándo y cómo vas." />
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Nuevo trabajo</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <AssignmentForm today={day} subjects={subjects} />
          </CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Pendientes</CardTitle>
            </CardHeader>
            <CardContent className="px-4 text-sm">
              {v.open.length ? (
                <ul className="grid gap-2" aria-label="Trabajos pendientes">
                  {v.open.map((a) => (
                    <li key={a.id} className="grid gap-1 rounded-md border p-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {a.subject} · {a.title}
                        </span>
                        <span className={cn("shrink-0 text-xs", a.alert.level === "red" && "font-semibold text-destructive", a.alert.level === "amber" && "font-medium")}>{a.alert.text}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Entrega el {formatDate(a.dueOn, { weekday: "short", day: "numeric", month: "short" })}
                        {a.weightPct != null ? ` · ${a.weightPct} % de la nota` : ""}
                      </p>
                      <AssignmentActions id={a.id} title={a.title} status={a.status} grade={a.grade} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Nada pendiente.</p>
              )}
            </CardContent>
          </Card>
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-base">Entregados y notas</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4 text-sm">
              {v.averages.length ? (
                <ul className="grid gap-1" aria-label="Media por asignatura">
                  {v.averages.map((a) => (
                    <li key={a.subject} className="flex justify-between gap-2">
                      <span>{a.subject}</span>
                      <span className="tabular-nums">
                        {formatNum(a.average, 2)}
                        {a.gradedPct ? <span className="text-xs text-muted-foreground"> ({a.gradedPct} % calificado)</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {v.done.length ? (
                <ul className="grid gap-2" aria-label="Trabajos entregados">
                  {v.done.map((a) => (
                    <li key={a.id} className="grid gap-1 border-t pt-2">
                      <span>
                        {a.subject} · {a.title}
                        {a.grade != null ? <span className="font-medium tabular-nums"> · {formatNum(a.grade, 2)}</span> : null}
                      </span>
                      <AssignmentActions id={a.id} title={a.title} status={a.status} grade={a.grade} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Aún no has entregado nada.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
