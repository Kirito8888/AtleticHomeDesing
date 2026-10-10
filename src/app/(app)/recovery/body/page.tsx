import { PageHeader } from "@/components/page-header";
import { BodyForm } from "@/components/recovery/body-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { type Girth, measureChanges, type Skinfold, skinfoldSum } from "@/lib/recovery/body-measures";

export const metadata = { title: "Antropometría · Atlenza" };

export default async function BodyPage() {
  const user = await pageUser();
  const rows = (await prisma.bodyMeasure.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 30 })).map((r) => ({
    id: r.id,
    date: toIsoDay(r.date),
    ...(r.data as { girths: Partial<Record<Girth, number>>; skinfolds: Partial<Record<Skinfold, number>> }),
  }));
  const c = measureChanges(rows);
  return (
    <>
      <PageHeader title="Antropometría" description="Perímetros y pliegues: solo los ves tú (tu entrenadora no tiene acceso)." />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Nueva toma</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <BodyForm today={toIsoDay(today())} />
          </CardContent>
        </Card>
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Evolución</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4 text-sm" aria-label="Evolución de las medidas">
            {c.skinfoldSum ? (
              <p>
                Suma de 6 pliegues: <span className="font-semibold tabular-nums">{formatNum(c.skinfoldSum.to.v, 1)} mm</span> ({c.skinfoldSum.diff > 0 ? "+" : ""}
                {formatNum(c.skinfoldSum.diff, 1)} desde el {formatDate(c.skinfoldSum.from.date)})
              </p>
            ) : null}
            {c.girths.length ? (
              <ul className="grid gap-0.5 tabular-nums">
                {c.girths.map((x) => (
                  <li key={x.key} className="flex justify-between gap-2">
                    <span>{x.label}</span>
                    <span>
                      {formatNum(x.to.v, 1)} cm ({x.diff > 0 ? "+" : ""}
                      {formatNum(x.diff, 1)})
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {rows.length ? (
              <ul className="grid gap-0.5 border-t pt-2 text-xs text-muted-foreground">
                {rows.slice(0, 10).map((r) => (
                  <li key={r.id}>
                    {formatDate(r.date, { day: "numeric", month: "short", year: "numeric" })}: {Object.keys(r.girths).length} perímetros, {Object.keys(r.skinfolds).length} pliegues
                    {skinfoldSum(r.skinfolds) != null ? ` · suma ${formatNum(skinfoldSum(r.skinfolds)!, 1)} mm` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Aún no hay medidas. Tómalas siempre en las mismas condiciones (mañana, mismo lado, misma persona).</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
