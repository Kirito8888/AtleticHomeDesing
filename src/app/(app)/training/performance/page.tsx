import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { StatusLabel, tsbStatus } from "@/components/status";
import { AttemptsScatter, E1rmChart, MarksChart, PmcCharts } from "@/components/charts/lazy";
import { SeasonGoals } from "@/components/training/season-goals";
import type { PmcPoint } from "@/components/training/pmc-charts";
import { Card, CardContent } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, today } from "@/lib/dates";
import { formatDate, formatNum } from "@/lib/format";
import { implementBestsFor } from "@/lib/training/implement-bests-query";
import { e1rmChange, e1rmSeries, exercisesWithData } from "@/lib/training/strength-progress";
import { strengthRows } from "@/lib/training/strength-progress-query";
import { getPrefs } from "@/lib/rules/prefs-service";
import { getPerformanceSeries } from "@/lib/training/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Rendimiento · Atlenza" };

const RANGES = [30, 90, 365] as const;

export default async function PerformancePage({ searchParams }: PageProps<"/training/performance">) {
  const user = await pageUser();
  const { days: raw, ex, imp } = await searchParams;
  const days = RANGES.find((r) => String(r) === raw) ?? 90;
  const [perf, rows, bests, prefs] = await Promise.all([getPerformanceSeries(user.id, days), strengthRows(user.id, addDays(today(), -days)), implementBestsFor(user.id), getPrefs(user.id)]);
  const implement = bests.find((b) => b.key === imp) ?? bests[0];
  const cur = perf.current;
  const exercises = exercisesWithData(rows);
  const selected = exercises.find((e) => e.id === ex) ?? exercises[0];
  const e1rm = selected ? e1rmSeries(rows, selected.id) : [];
  const change = e1rmChange(e1rm);

  return (
    <>
      <PageHeader
        title="Rendimiento"
        description="Performance Management Chart y recuperación"
        action={
          <Link href={`/print/season?year=${today().getUTCFullYear()}`} className="text-sm font-medium underline underline-offset-4">
            Informe de temporada
          </Link>
        }
      />

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

      <section aria-labelledby="bests-title" className="mt-8 grid gap-3">
        <h2 id="bests-title" className="text-base font-semibold">
          Lanzamientos: los 3 mejores por implemento
        </h2>
        {implement ? (
          <>
            <nav aria-label="Implemento" className="flex gap-1.5 overflow-x-auto pb-1">
              {bests.map((b) => (
                <Link
                  key={b.key}
                  href={`?days=${days}&imp=${encodeURIComponent(b.key)}`}
                  aria-current={b.key === implement.key ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-xs",
                    b.key === implement.key ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {b.label}
                </Link>
              ))}
            </nav>
            <ol className="grid gap-1.5 sm:grid-cols-3" aria-label={`Mejores marcas: ${implement.label}`}>
              {implement.top.map((t, i) => (
                <li key={t.date} className="flex items-baseline justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    {["🥇", "🥈", "🥉"][i]} <span className="font-semibold tabular-nums">{formatNum(t.markM, 2)} m</span>
                    {t.isCompetition ? <span className="ml-1 text-xs text-muted-foreground">(competición)</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(t.date, { day: "numeric", month: "short", year: "2-digit" })}</span>
                </li>
              ))}
            </ol>
            {implement.series.length > 1 ? (
              <>
                <MarksChart data={implement.series} name={implement.label} />
                <p className="text-xs text-muted-foreground">Cada intento válido (cuanto más agrupados, más consistente):</p>
                <AttemptsScatter data={implement.attempts} name={implement.label} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Registra marcas con este implemento en al menos dos días para ver su evolución.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sin marcas de lanzamiento todavía.</p>
        )}
      </section>

      <section aria-labelledby="season-title" className="mt-8 grid gap-3">
        <h2 id="season-title" className="text-base font-semibold">
          Temporada: marcas en competición{implement ? ` · ${implement.label}` : ""}
        </h2>
        {implement && implement.competitions.length ? (
          <MarksChart data={implement.competitions} name={`competiciones, ${implement.label}`} goals={prefs.seasonGoals} />
        ) : (
          <p className="text-sm text-muted-foreground">Aún no hay competiciones con este implemento. Regístralas desde Planificación → la competición → Hoja de intentos.</p>
        )}
        <SeasonGoals goals={prefs.seasonGoals} />
      </section>

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
