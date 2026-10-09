import { PageHeader } from "@/components/page-header";
import { AddPrehab, PrehabActions } from "@/components/training/prehab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { adherence, PREHAB_TEMPLATES } from "@/lib/training/prehab";
import { cn } from "@/lib/utils";

export const metadata = { title: "Prehabilitación · LifeOS" };

export default async function PrehabPage() {
  const user = await pageUser();
  const now = today();
  const day = toIsoDay(now);
  const routines = await prisma.prehabRoutine.findMany({
    where: { userId: user.id, archived: false },
    orderBy: { createdAt: "asc" },
    include: { logs: { where: { date: { gte: addDays(now, -13) } }, select: { date: true } } },
  });
  const used = new Set(routines.map((r) => r.name));
  const templates = Object.entries(PREHAB_TEMPLATES)
    .filter(([, t]) => !used.has(t.name))
    .map(([key, t]) => ({ key, name: t.name }));
  return (
    <>
      <PageHeader title="Prehabilitación" description="Hombro, codo y tronco: poco y a menudo. Puedes hacerla en el calentamiento; el plan no cambia." />
      {templates.length ? (
        <div className="mb-4">
          <AddPrehab templates={templates} />
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {routines.map((r) => {
          const a = adherence(
            r.logs.map((l) => toIsoDay(l.date)),
            day,
          );
          return (
            <Card key={r.id} className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{r.name}</span>
                  <span className="text-xs font-normal text-muted-foreground tabular-nums">{a.thisWeek} días esta semana</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 px-4 text-sm">
                <ul className="grid gap-0.5">
                  {(r.exercises as Array<{ name: string; dose: string }>).map((e) => (
                    <li key={e.name} className="flex justify-between gap-2">
                      <span className="min-w-0">{e.name}</span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">{e.dose}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-1" aria-hidden>
                  {a.last7.map((d) => (
                    <span key={d.date} className={cn("size-2 rounded-full", d.done ? "bg-primary" : "bg-muted")} />
                  ))}
                </div>
                <PrehabActions id={r.id} name={r.name} today={day} done={a.doneToday} />
              </CardContent>
            </Card>
          );
        })}
      </div>
      {!routines.length ? <p className="text-sm text-muted-foreground">Añade una rutina de las plantillas. Son genéricas: ajústalas con tu fisio.</p> : null}
    </>
  );
}
