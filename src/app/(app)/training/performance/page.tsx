import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { StatusLabel, tsbStatus } from "@/components/status";
import { E1rmChart } from "@/components/training/e1rm-chart";
import { PmcCharts, type PmcPoint } from "@/components/training/pmc-charts";
import { Card, CardContent } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, today } from "@/lib/dates";
import { formatNum } from "@/lib/format";
import { e1rmChange, e1rmSeries, exercisesWithData } from "@/lib/training/strength-progress";
import { strengthRows } from "@/lib/training/strength-progress-query";
import { getPerformanceSeries } from "@/lib/training/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Rendimiento · LifeOS" };

const RANGES = [30, 90, 365] as const;

export default async function PerformancePage({ searchParams }: PageProps<"/training/performance">) {
  const user = await pageUser();
  const { days: raw, ex } = await searchParams;
  const days = RANGES.find((r) => String(r) === raw) ?? 90;
  const [perf, rows] = await Promise.all([getPerformanceSeries(user.id, days), strengthRows(user.id, addDays(today(), -days))]);
  const cur = perf.current;
  const exercises = exercisesWithData(rows);
  const selected = exercises.find((e) => e.id === ex) ?? exercises[0];
  const e1rm = selected ? e1rmSeries(rows, selected.id) : [];
  const change = e1rmChange(e1rm);

  return (
    <>
      <PageHeader title="Rendimiento" description="Performance Management Chart y recuperación" />

      <nav aria-label="Rango" className="mb-4 inline-flex rounded-lg bg-muted p-1">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`?days=${r}`}
            aria-current={r === days ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground", r === days && "bg-background text-foreground shadow-sm")}
          >
            {r === 365 ? "1 año" : `${r} días`}
          </Link>
        ))}
      </nav>

      {cur ? (
        <Card className="mb-6 py-4">
          <CardContent className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-5">
            <Stat label="Fitness (CTL)" value={formatNum(cur.ctl)} swatch="--series-1" />
            <Stat label="Fatiga (ATL)" value={formatNum(cur.atl)} swatch="--series-2" />
            <Stat label="Forma (TSB)" value={formatNum(cur.tsb)} swatch="--series-3" hint={<StatusLabel status={tsbStatus(cur.tsb)} className="text-xs">{cur.tsb < -25 ? "Fatiga alta" : cur.tsb < -10 ? "Cargando" : "Fresco"}</StatusLabel>} />
            <Stat label="ACWR" value={cur.acwr != null ? formatNum(cur.acwr, 2) : "—"} hint={cur.acwr == null ? "Necesita 28 días" : "Zona 0,8–1,3"} />
            <Stat label="Rampa CTL (7 d)" value={cur.rampRate != null ? formatNum(cur.rampRate) : "—"} hint="> 5–8 = agresiva" />
          </CardContent>
        </Card>
      ) : null}

      {perf.series.length ? (
        <PmcCharts data={perf.series as unknown as PmcPoint[]} />
      ) : (
        <p className="text-sm text-muted-foreground">Sin datos todavía.</p>
      )}

      <section aria-labelledby="e1rm-title" className="mt-8 grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="e1rm-title" className="text-base font-semibold">
            Fuerza: 1RM estimado
          </h2>
          {change ? (
            <span className={cn("text-sm tabular-nums", change.kg >= 0 ? "text-foreground" : "text-destructive")}>
              {change.kg >= 0 ? "+" : ""}
              {formatNum(change.kg, 1)} kg ({change.pct >= 0 ? "+" : ""}
              {formatNum(change.pct, 1)} %)
            </span>
          ) : null}
        </div>
        {exercises.length ? (
          <>
            <nav aria-label="Ejercicio" className="flex gap-1.5 overflow-x-auto pb-1">
              {exercises.slice(0, 12).map((e) => (
                <Link
                  key={e.id}
                  href={`?days=${days}&ex=${e.id}`}
                  aria-current={e.id === selected?.id ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs",
                    e.id === selected?.id ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {e.name}
                </Link>
              ))}
            </nav>
            {e1rm.length > 1 ? (
              <E1rmChart data={e1rm} name={selected!.name} />
            ) : (
              <p className="text-sm text-muted-foreground">Registra este ejercicio en al menos dos días para ver su evolución.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sin series de fuerza en este periodo.</p>
        )}
      </section>
    </>
  );
}
