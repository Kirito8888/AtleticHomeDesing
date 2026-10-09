import { BankImport, type ImportProfile } from "@/components/finance/bank-import";
import { CashflowChart } from "@/components/finance/cashflow-chart";
import { DeleteTransaction, ManageFinance, QuickTransaction, RunSubscriptionsButton, SportToggle } from "@/components/finance/finance-forms";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { StatusLabel } from "@/components/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { pageUser } from "@/lib/auth/page";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { periodWindow } from "@/lib/finance/ledger";
import { budgetsStatus, cashflow, listAccounts, spendingByCategory, sportExpenses, sportSeasonBalance, subscriptionsOverview } from "@/lib/finance/service";
import { formatDate, formatEur } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Finanzas · LifeOS" };

const INTERVAL_LABEL = { WEEKLY: "semana", MONTHLY: "mes", QUARTERLY: "trimestre", YEARLY: "año" } as const;

export default async function FinancePage() {
  const user = await pageUser();
  const now = today();
  const month = periodWindow("MONTHLY", now);
  const [accounts, categories, budgets, flow, spending, subs, recent, importProfiles, sportSeasons, competitions, sportBal] = await Promise.all([
    listAccounts(user.id),
    prisma.financialCategory.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
    budgetsStatus(user.id, now),
    cashflow(user.id, 6),
    spendingByCategory(user.id, month.start, month.end),
    subscriptionsOverview(user.id),
    prisma.financialTransaction.findMany({
      where: { userId: user.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 12,
      include: { postings: { include: { account: { select: { name: true, type: true } }, category: { select: { name: true } } } } },
    }),
    prisma.bankImportProfile.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    sportExpenses(user.id),
    prisma.calendarEvent.findMany({
      where: { userId: user.id, type: "COMPETITION", startAt: { gte: addDays(now, -120), lte: addDays(now, 240) } },
      orderBy: { startAt: "asc" },
      select: { id: true, title: true, startAt: true },
    }),
    sportSeasonBalance(user.id, toIsoDay(now)),
  ]);
  const money = accounts.filter((a) => a.type === "ASSET" || a.type === "LIABILITY");
  const netWorth = money.reduce((a, x) => a + x.balanceCents, 0);
  const thisMonth = flow.at(-1);
  const maxSpend = Math.max(1, ...spending.map((s) => s.totalCents));
  const todayIso = toIsoDay(now);

  return (
    <>
      <PageHeader
        title="Finanzas"
        action={
          <div className="flex gap-2">
            {money.length ? (
              <BankImport
                accounts={money.map((a) => ({ id: a.id, name: a.name }))}
                profiles={importProfiles.map((p) => ({ id: p.id, name: p.name, accountId: p.accountId, mapping: p.mapping as unknown as ImportProfile["mapping"] }))}
              />
            ) : null}
            <ManageFinance accounts={accounts} categories={categories} today={todayIso} />
            <QuickTransaction accounts={accounts} categories={categories} today={todayIso} competitions={competitions.map((c) => ({ id: c.id, title: c.title, date: toIsoDay(c.startAt) }))} />
          </div>
        }
      />

      <Card className="mb-4 py-4">
        <CardContent className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-4">
          <Stat label="Patrimonio neto" value={formatEur(netWorth)} />
          <Stat label="Ingresos (mes)" value={formatEur(thisMonth?.incomeCents ?? 0)} />
          <Stat label="Gastos (mes)" value={formatEur(thisMonth?.expenseCents ?? 0)} />
          <Stat label="Suscripciones / mes" value={formatEur(subs.monthlyCents)} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Cuentas</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {money.length ? (
              <ul className="grid gap-2">
                {money.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 text-sm">
                    <span className="truncate">
                      {a.name}
                      {a.type === "LIABILITY" ? <span className="text-xs text-muted-foreground"> · pasivo</span> : null}
                    </span>
                    <span className="font-medium tabular-nums">{formatEur(a.balanceCents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Añade tu primera cuenta en «Gestionar».</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Presupuestos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 px-4">
            {budgets.length ? (
              budgets.map((b) => {
                const status = b.state === "EXCEEDED" ? "critical" : b.state === "WARNING" ? "warning" : "good";
                return (
                  <div key={b.id} className="grid gap-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <StatusLabel status={status}>{b.category.name}</StatusLabel>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatEur(b.spentCents)} / {formatEur(b.budgetCents)} · {b.pct} %
                      </span>
                    </div>
                    <Progress
                      value={b.pct}
                      aria-label={`${b.category.name}: ${b.pct} %`}
                      indicatorClassName={status === "critical" ? "bg-status-critical" : status === "warning" ? "bg-status-warning" : "bg-status-good"}
                    />
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">Sin presupuestos.</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3 py-4 lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Flujo de caja (6 meses)</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <CashflowChart data={flow} />
          </CardContent>
        </Card>

        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Gasto por categoría (este mes)</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {spending.length ? (
              <ul className="grid gap-2">
                {spending.map((s) => (
                  <li key={s.categoryId ?? "none"} className="grid gap-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate">{s.name}</span>
                      <span className="tabular-nums">{formatEur(s.totalCents)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-series-1" style={{ width: `${(s.totalCents / maxSpend) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3 py-4">
          <CardHeader className="flex flex-row items-center justify-between px-4">
            <CardTitle className="text-sm">Suscripciones</CardTitle>
            <RunSubscriptionsButton />
          </CardHeader>
          <CardContent className="px-4">
            {subs.subscriptions.length ? (
              <ul className="grid gap-2">
                {subs.subscriptions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">
                        {s.name}
                        {!s.isActive ? <span className="text-xs text-muted-foreground"> · pausada</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Próximo: {formatDate(s.nextChargeDate)} {s.autoPost ? "· automático" : ""}
                      </div>
                    </div>
                    <span className="shrink-0 tabular-nums">
                      {formatEur(s.amountCents)}
                      <span className="text-xs text-muted-foreground"> /{INTERVAL_LABEL[s.interval]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin suscripciones.</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3 py-4 lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Temporada deportiva: becas y gastos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 px-4">
            {sportBal.some((b) => b.incomeCents > 0) ? (
              <ul className="grid gap-2 text-sm" aria-label="Saldo deportivo por temporada">
                {sportBal.slice(0, 3).map((b) => (
                  <li key={b.season} className="grid gap-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium">Temporada {b.season}</span>
                      <span className={b.balanceCents < 0 ? "font-medium text-destructive tabular-nums" : "font-medium tabular-nums"}>Saldo {formatEur(b.balanceCents)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Becas, premios y patrocinios {formatEur(b.incomeCents)} · gastos {formatEur(-b.expenseCents)}
                    </p>
                    {b.forecast ? (
                      <p className={b.forecast.balanceCents < 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                        Previsión a fin de año al ritmo actual: gastos {formatEur(-b.forecast.expenseCents)} · saldo {formatEur(b.forecast.balanceCents)}
                        {b.forecast.balanceCents < 0 ? ". Con lo cobrado no llega: busca otra ayuda o recorta." : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Marca con 🏅 tus ingresos deportivos (becas, premios, patrocinios) para ver el saldo de la temporada y la previsión.</p>
            )}
            {sportSeasons.length ? (
              <div className="grid gap-4 sm:grid-cols-2" aria-label="Gastos deportivos">
                {sportSeasons.slice(0, 4).map((s) => (
                  <section key={s.season} className="grid gap-1 text-sm">
                    <div className="flex items-baseline justify-between font-medium">
                      <span>Temporada {s.season}</span>
                      <span className="tabular-nums">{formatEur(-s.totalCents)}</span>
                    </div>
                    <ul className="grid gap-0.5 text-xs text-muted-foreground">
                      {s.byEvent.map((e) => (
                        <li key={e.eventId ?? "none"} className="flex justify-between gap-2">
                          <span className="truncate">{e.title}</span>
                          <span className="shrink-0 tabular-nums">{formatEur(-e.totalCents)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Marca un gasto con 🏅 (o al crearlo) para verlo aquí por temporada y competición.</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3 py-4 lg:col-span-2">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">Últimos movimientos</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {recent.length ? (
              <ul className="grid gap-2">
                {recent.map((t) => {
                  const moneyLeg = t.postings.find((p) => p.account.type === "ASSET" || p.account.type === "LIABILITY");
                  const cat = t.postings.find((p) => p.category)?.category?.name;
                  const amount = t.kind === "TRANSFER" ? Math.abs(moneyLeg?.amountCents ?? 0) : (moneyLeg?.amountCents ?? 0);
                  return (
                    <li key={t.id} className="flex items-center gap-3 text-sm">
                      <span className="w-12 shrink-0 text-xs text-muted-foreground">{formatDate(t.date)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{t.description}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {t.kind === "TRANSFER"
                            ? "Transferencia"
                            : t.kind === "OPENING_BALANCE"
                              ? "Saldo de apertura"
                              : t.kind === "ADJUSTMENT"
                                ? "Ajuste"
                                : (cat ?? "Sin categoría")}
                          {moneyLeg ? ` · ${moneyLeg.account.name}` : ""}
                        </div>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">
                        {t.kind === "TRANSFER" ? "⇄ " : amount > 0 ? "+" : ""}
                        {formatEur(amount)}
                      </span>
                      {t.kind === "EXPENSE" || t.kind === "INCOME" ? <SportToggle id={t.id} sport={t.sport} income={t.kind === "INCOME"} /> : null}
                      <DeleteTransaction id={t.id} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin movimientos.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
