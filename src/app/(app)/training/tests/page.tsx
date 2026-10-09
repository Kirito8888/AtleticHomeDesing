import { PageHeader } from "@/components/page-header";
import { TestForm } from "@/components/training/test-form";
import { ValueChart } from "@/components/training/value-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { today, toIsoDay } from "@/lib/dates";
import { formatDate, formatNum } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { summarizeTests } from "@/lib/training/physical-tests";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tests físicos · LifeOS" };

export default async function TestsPage() {
  const user = await pageUser();
  const rows = await prisma.testResult.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } });
  const tests = summarizeTests(rows.map((r) => ({ ...r, date: toIsoDay(r.date) })));
  return (
    <>
      <PageHeader title="Tests físicos" description="Tu batería de tests: 30 m, saltos, balón medicinal… o los tuyos." />
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">Nuevo resultado</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <TestForm today={toIsoDay(today())} />
          </CardContent>
        </Card>
        <div className="grid gap-4" aria-label="Resultados por test">
          {tests.length ? (
            tests.map((t) => (
              <Card key={t.testKey} className="gap-2 py-4">
                <CardHeader className="px-4">
                  <CardTitle className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{t.name}</span>
                    {t.changePct != null ? (
                      <span className={cn("text-xs tabular-nums", t.changePct >= 0 ? "text-foreground" : "text-destructive")}>
                        {t.changePct >= 0 ? "▲" : "▼"} {formatNum(Math.abs(t.changePct), 1)} %
                      </span>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 px-4 text-sm">
                  <p>
                    Último: <span className="font-semibold tabular-nums">{formatNum(t.last.value, 2)} {t.unit}</span> ({formatDate(t.last.date, { day: "numeric", month: "short" })}) · mejor:{" "}
                    <span className="font-semibold tabular-nums">{formatNum(t.best.value, 2)} {t.unit}</span>
                  </p>
                  {t.series.length > 1 ? <ValueChart data={t.series} name={t.name} unit={t.unit} higherIsBetter={t.higherIsBetter} /> : null}
                </CardContent>
              </Card>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay resultados.</p>
          )}
        </div>
      </div>
    </>
  );
}
