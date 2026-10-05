import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EVENT_META, LEVEL_META, PHASE_LABEL, type EventType } from "@/components/planning/meta";
import { AddPlanningSheet, DeleteButton } from "@/components/planning/planning-forms";
import { TaskList, type TaskItem } from "@/components/planning/task-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, startOfIsoWeek, today, toIsoDay } from "@/lib/dates";
import { capitalizeFirst, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata = { title: "Planificación · LifeOS" };

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

export default async function PlanningPage({ searchParams }: PageProps<"/planning">) {
  const user = await pageUser();
  const { month: raw } = await searchParams;
  const now = today();
  const month = typeof raw === "string" && /^\d{4}-\d{2}$/.test(raw) ? raw : toIsoDay(now).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const gridStart = startOfIsoWeek(first);
  const gridEnd = addDays(startOfIsoWeek(last), 6);
  const prev = toIsoDay(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7);
  const next = toIsoDay(new Date(Date.UTC(y, m, 1))).slice(0, 7);

  const [cycles, events, sessions, allCycles, tasks] = await Promise.all([
    prisma.trainingCycle.findMany({
      where: { userId: user.id, startDate: { lte: gridEnd }, endDate: { gte: gridStart } },
      orderBy: [{ level: "asc" }, { startDate: "asc" }],
    }),
    prisma.calendarEvent.findMany({ where: { userId: user.id, startAt: { gte: gridStart, lte: gridEnd } }, orderBy: { startAt: "asc" } }),
    prisma.trainingSession.groupBy({ by: ["date", "status"], where: { userId: user.id, date: { gte: gridStart, lte: gridEnd } }, _count: { _all: true } }),
    prisma.trainingCycle.findMany({ where: { userId: user.id, endDate: { gte: addDays(now, -365) } }, select: { id: true, name: true, level: true }, orderBy: { startDate: "desc" } }),
    prisma.task.findMany({ where: { userId: user.id, status: { in: ["TODO", "IN_PROGRESS"] } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }] }),
  ]);

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const todayIso = toIsoDay(now);
  const monthLabel = capitalizeFirst(new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(first));
  const monthEvents = events.filter((e) => e.startAt >= first && e.startAt <= last);
  const taskItems: TaskItem[] = tasks
    .map((t) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate ? toIsoDay(t.dueDate) : null }))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  return (
    <>
      <PageHeader title="Planificación" description="Periodización, eventos y tareas" action={<AddPlanningSheet cycles={allCycles} defaultDate={todayIso} />} />

      <div className="mb-3 flex items-center justify-between">
        <Button asChild variant="ghost" size="icon" aria-label="Mes anterior">
          <Link href={`?month=${prev}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <Button asChild variant="ghost" size="icon" aria-label="Mes siguiente">
          <Link href={`?month=${next}`}>
            <ChevronRight />
          </Link>
        </Button>
      </div>

      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {Object.entries(LEVEL_META).map(([k, l]) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-4 rounded-full" style={{ background: l.color }} /> {l.label}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted py-1 text-center font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const iso = toIsoDay(d);
          const inMonth = d >= first && d <= last;
          const dayCycles = cycles.filter((c) => c.startDate <= d && c.endDate >= d);
          const dayEvents = events.filter((e) => e.startAt <= d && (e.endAt ?? e.startAt) >= d);
          const done = sessions.filter((s) => toIsoDay(s.date) === iso && s.status === "COMPLETED").reduce((a, s) => a + s._count._all, 0);
          const planned = sessions.filter((s) => toIsoDay(s.date) === iso && s.status === "PLANNED").reduce((a, s) => a + s._count._all, 0);
          return (
            <div key={iso} className={cn("flex min-h-16 flex-col gap-0.5 bg-background p-1 sm:min-h-24", !inMonth && "bg-muted/40 text-muted-foreground")}>
              <span className={cn("self-end tabular-nums", iso === todayIso && "rounded-full bg-primary px-1.5 text-primary-foreground")}>{d.getUTCDate()}</span>
              {(["MACRO", "MESO", "MICRO"] as const).map((lvl) => {
                const c = dayCycles.find((x) => x.level === lvl);
                return c ? (
                  <span key={lvl} title={`${LEVEL_META[lvl].label}: ${c.name}`} className="h-1 rounded-full" style={{ background: c.color ?? LEVEL_META[lvl].color }} />
                ) : null;
              })}
              <div className="mt-auto flex flex-wrap items-center gap-0.5">
                {dayEvents.map((e) => {
                  const Icon = EVENT_META[e.type as EventType].icon;
                  return (
                    <span key={e.id} title={`${EVENT_META[e.type as EventType].label}: ${e.title}`}>
                      <Icon className="size-3.5" aria-label={EVENT_META[e.type as EventType].label} />
                    </span>
                  );
                })}
                {done ? <span className="ml-auto text-[10px] text-muted-foreground" title="Sesiones completadas">✓{done > 1 ? done : ""}</span> : null}
                {planned ? <span className="text-[10px] text-muted-foreground" title="Sesiones planificadas">○{planned > 1 ? planned : ""}</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Eventos del mes</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {monthEvents.length ? (
              <ul className="grid gap-2">
                {monthEvents.map((e) => {
                  const meta = EVENT_META[e.type as EventType];
                  return (
                    <li key={e.id} className="flex items-center gap-3 text-sm">
                      <meta.icon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">
                          {e.title}
                          {e.priority ? <span className="ml-1 text-xs text-muted-foreground">({e.priority})</span> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {meta.label} · {formatDate(e.startAt)}
                          {e.endAt ? `–${formatDate(e.endAt)}` : ""}
                        </div>
                      </div>
                      <DeleteButton url={`/api/planning/events/${e.id}`} label={e.title} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin eventos este mes.</p>
            )}
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Ciclos activos</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {cycles.length ? (
              <ul className="grid gap-2">
                {cycles.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: c.color ?? LEVEL_META[c.level].color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {LEVEL_META[c.level].label}
                        {c.phase ? ` · ${PHASE_LABEL[c.phase]}` : ""} · {formatDate(c.startDate)}–{formatDate(c.endDate)}
                      </div>
                    </div>
                    <DeleteButton url={`/api/planning/cycles/${c.id}`} label={c.name} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Crea un macrociclo y divídelo en mesociclos y microciclos.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mt-6 grid gap-3" aria-labelledby="tasks-h">
        <h2 id="tasks-h" className="text-lg font-semibold">
          Tareas
        </h2>
        <TaskList tasks={taskItems} todayIso={todayIso} />
      </section>
    </>
  );
}
