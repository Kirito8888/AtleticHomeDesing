import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { StatusLabel, tsbStatus } from "@/components/status";
import { PmcCharts, type PmcPoint } from "@/components/training/pmc-charts";
import { Card, CardContent } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { formatNum } from "@/lib/format";
import { getPerformanceSeries } from "@/lib/training/service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Rendimiento · LifeOS" };

const RANGES = [30, 90, 365] as const;

export default async function PerformancePage({ searchParams }: PageProps<"/training/performance">) {
  const user = await pageUser();
  const { days: raw } = await searchParams;
  const days = RANGES.find((r) => String(r) === raw) ?? 90;
  const perf = await getPerformanceSeries(user.id, days);
  const cur = perf.current;

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
    </>
  );
}
