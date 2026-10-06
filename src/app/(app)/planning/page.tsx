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
import { capitalizeFirst, formatDate, formatNum, SESSION_TYPE_LABEL } from "@/lib/format";
import { agendaForDay, tasksDuePerDay } from "@/lib/planning/agenda";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata = { title: "Planificación · LifeOS" };

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

export default async function PlanningPage({ searchParams }: PageProps<"/planning">) {
  const user = await pageUser();
  const { month: raw, day: rawDay } = await searchParams;
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
    prisma.trainingSession.findMany({
      where: { userId: user.id, date: { gte: gridStart, lte: gridEnd } },
      orderBy: { createdAt: "asc" },
      select: { id: true, date: true, title: true, type: true, status: true, tss: true },
    }),
    prisma.trainingCycle.findMany({ where: { userId: user.id, endDate: { gte: addDays(now, -365) } }, select: { id: true, name: true, level: true }, orderBy: { startDate: "desc" } }),
    prisma.task.findMany({ where: { userId: user.id, status: { in: ["TODO", "IN_PROGRESS"] } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }] }),
  ]);

  const dueByDay = tasksDuePerDay(tasks);
  const selectedDay = typeof rawDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : null;
  const agenda = selectedDay ? agendaForDay(selectedDay, { sessions, events, tasks, cycles }) : null;

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
          const done = sessions.filter((s) => toIsoDay(s.date) === iso && s.status === "COMPLETED").length;
          const planned = sessions.filter((s) => toIsoDay(s.date) === iso && s.status === "PLANNED").length;
          const due = dueByDay.get(iso) ?? 0;
          return (
            <Link
              key={iso}
              href={`?month=${month}&day=${iso}#dia`}
              scroll={false}
              aria-label={`Ver ${formatDate(iso, { weekday: "long", day: "numeric", month: "long" })}`}
              aria-current={iso === selectedDay ? "date" : undefined}
              className={cn(
                "flex min-h-16 flex-col gap-0.5 bg-background p-1 hover:bg-accent sm:min-h-24",
                !inMonth && "bg-muted/40 text-muted-foreground",
                iso === selectedDay && "ring-2 ring-primary ring-inset",
              )}
            >
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
                {due ? <span className="text-[10px] text-muted-foreground" title="Tareas que vencen">□{due > 1 ? due : ""}</span> : null}
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">✓ sesión hecha · ○ planificada · □ tarea que vence. Toca un día para ver su detalle.</p>

      {agenda ? (
        <Card id="dia" className="mt-4 scroll-mt-4 gap-3 py-4">
          <CardHeader className="flex flex-row items-center justify-between px-4">
            <CardTitle className="text-sm">{capitalizeFirst(formatDate(agenda.day, { weekday: "long", day: "numeric", month: "long" }))}</CardTitle>
            <Link href={`/training/new`} className="text-xs text-muted-foreground hover:text-foreground">
              + Sesión
            </Link>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm">
            {agenda.cycles.length ? (
              <p className="text-xs text-muted-foreground">
                {agenda.cycles.map((c) => `${LEVEL_META[c.level as keyof typeof LEVEL_META].label}: ${c.name}`).join(" · ")}
              </p>
            ) : null}
            {agenda.sessions.length ? (
              <ul className="grid gap-1" aria-label="Sesiones del día">
                {agenda.sessions.map((s) => (
                  <li key={s.id}>
                    <Link href={`/training/${s.id}`} className="flex justify-between gap-2 rounded-md border px-2 py-1.5 hover:bg-accent">
                      <span className="truncate">
                        {s.status === "PLANNED" ? "○ " : "✓ "}
                        {s.title ?? SESSION_TYPE_LABEL[s.type as keyof typeof SESSION_TYPE_LABEL]}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{s.tss != null ? `${formatNum(s.tss)} TSS` : s.status === "PLANNED" ? "planificada" : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            {agenda.events.length ? (
              <ul className="grid gap-1" aria-label="Eventos del día">
                {agenda.events.map((e) => {
                  const meta = EVENT_META[e.type as EventType];
                  return (
                    <li key={e.id} className="flex items-center gap-2">
                      <meta.icon className="size-4 shrink-0 text-muted-foreground" /> {e.title}
                      <span className="text-xs text-muted-foreground">· {meta.label}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {agenda.tasks.length ? (
              <ul className="grid gap-1" aria-label="Tareas que vencen">
                {agenda.tasks.map((t) => (
                  <li key={t.id}>□ {t.title}</li>
                ))}
              </ul>
            ) : null}
            {!agenda.sessions.length && !agenda.events.length && !agenda.tasks.length ? (
              <p className="text-muted-foreground">Nada planificado este día.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

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
