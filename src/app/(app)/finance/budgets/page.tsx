import Link from "next/link";
import { ChevronLeft, ChevronRight, PiggyBank } from "lucide-react";

import { BudgetEditor } from "@/components/finance/budget-editor";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusLabel } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { pageUser } from "@/lib/auth/page";
import { toIsoDay, today } from "@/lib/dates";
import { isMonth, shiftMonth } from "@/lib/finance/budgets";
import { monthlyBudgetView } from "@/lib/finance/budgets-service";
import { ensureBasicCategories } from "@/lib/finance/service";
import { formatDec, formatEur, formatMonth } from "@/lib/format";

export const metadata = { title: "Presupuestos del mes · Finanzas · Atlenza" };

const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];
/** 80 → «80 %»; 73,3 → «73,3 %» (coma decimal es-ES). */
const pctText = (p: number) => `${formatDec(p, Number.isInteger(p) ? 0 : 1)} %`;
const navLink = "inline-flex size-11 shrink-0 items-center justify-center rounded-md border bg-background hover:bg-accent";

export default async function FinanceBudgetsPage({ searchParams }: PageProps<"/finance/budgets">) {
  const user = await pageUser();
  const sp = await searchParams;
  await ensureBasicCategories(user.id);
  const raw = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  const month = isMonth(raw) ? raw : toIsoDay(today()).slice(0, 7);
  const v = await monthlyBudgetView(user.id, month);
  const href = (m: string) => `/finance/budgets?month=${m}`;
  const totalPct = v.totalBudgetCents > 0 ? Math.round((v.totalSpentCents / v.totalBudgetCents) * 100) : null;

  return (
    <>
      <PageHeader
        title="Presupuestos del mes"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/finance">Volver</Link>
          </Button>
        }
      />

      <form method="get" action="/finance/budgets" aria-label="Mes" className="mb-4 flex min-w-0 items-center gap-2">
        <Link href={href(shiftMonth(month, -1))} aria-label="Mes anterior" className={navLink}>
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <Input type="month" name="month" defaultValue={month} aria-label="Mes" className="h-11 min-w-0 flex-1" />
        <Button type="submit" variant="outline" className="h-11">
          Ver
        </Button>
        <Link href={href(shiftMonth(month, 1))} aria-label="Mes siguiente" className={navLink}>
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      </form>

      <Card className="mb-4 gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm capitalize">Reparto de {formatMonth(month, "long")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-4">
          <p className="text-2xl font-semibold tabular-nums">
            {formatEur(v.totalSpentCents)}
            {v.totalBudgetCents > 0 ? <span className="text-sm font-normal text-muted-foreground"> de {formatEur(v.totalBudgetCents)} presupuestados{totalPct !== null ? ` · ${totalPct} %` : ""}</span> : null}
          </p>
          {v.slices.length ? (
            <>
              <div role="img" aria-label="Distribución del gasto del mes" className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
                {v.slices.map((s, i) => (
                  <span key={s.key} style={{ width: `${(s.cents / v.totalSpentCents) * 100}%`, background: COLORS[i % COLORS.length] }} />
                ))}
              </div>
              <ul className="grid gap-1.5 text-sm">
                {v.slices.map((s, i) => (
                  <li key={s.key} className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatEur(s.cents)} · {s.pct} %
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sin gastos registrados este mes.</p>
          )}
        </CardContent>
      </Card>

      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Límites por categoría</h2>
        <BudgetEditor month={month} categories={v.expenseCategories} label="Nuevo presupuesto" variant="default" />
      </div>

      {v.items.length ? (
        <ul className="grid gap-3">
          {v.items.map((b) => {
            const status = b.state === "EXCEEDED" ? "critical" : b.state === "WARNING" ? "warning" : "good";
            return (
              <li key={b.id} className="grid min-w-0 gap-2 rounded-lg border p-3" data-state={b.state}>
                <div className="flex items-center justify-between gap-2">
                  <StatusLabel status={status} className="min-w-0 [&>span]:truncate">
                    {b.name}
                  </StatusLabel>
                  <BudgetEditor month={month} categories={v.expenseCategories} categoryId={b.categoryId} budgetId={b.id} amountCents={b.budgetCents} alertThresholdPct={b.alertThresholdPct} label="Editar" variant="ghost" />
                </div>
                <Progress
                  value={b.barPct}
                  aria-label={`${b.name}: ${pctText(b.pct)}`}
                  indicatorClassName={status === "critical" ? "bg-status-critical" : status === "warning" ? "bg-status-warning" : "bg-status-good"}
                />
                <p className="flex flex-wrap justify-between gap-x-2 text-xs tabular-nums text-muted-foreground">
                  <span>
                    {formatEur(b.spentCents)} / {formatEur(b.budgetCents)} · {pctText(b.pct)}
                  </span>
                  <span className={b.state === "EXCEEDED" ? "font-medium text-destructive" : undefined}>
                    {b.state === "EXCEEDED" ? `Excedido en ${formatEur(b.overCents)}` : `Te quedan ${formatEur(b.remainingCents)}`}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={PiggyBank} title="Sin presupuestos este mes" text="Fija un límite mensual por categoría y verás aquí cuánto llevas." />
      )}

      {v.unbudgeted.length ? (
        <section aria-label="Gasto sin presupuesto" className="mt-4">
          <h2 className="mb-2 text-sm font-medium">Gasto sin presupuesto</h2>
          <ul className="grid gap-2">
            {v.unbudgeted.map((u) => (
              <li key={u.categoryId} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <span className="min-w-0 truncate">
                  {u.name} <span className="tabular-nums text-muted-foreground">· {formatEur(u.spentCents)}</span>
                </span>
                <BudgetEditor month={month} categories={v.expenseCategories} categoryId={u.categoryId} label="Fijar límite" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
