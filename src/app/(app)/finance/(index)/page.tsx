import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { BankImport, type ImportProfile } from "@/components/finance/bank-import";
import { ManageFinance, NewAccount, QuickTransaction } from "@/components/finance/finance-forms";
import { PageHeader } from "@/components/page-header";
import { TransactionRow } from "@/components/finance/transaction-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { pageUser } from "@/lib/auth/page";
import { addDays, today, toIsoDay } from "@/lib/dates";
import { moneySummary } from "@/lib/finance/balances";
import { cashflow, ensureBasicCategories, listAccounts } from "@/lib/finance/service";
import { formatEur } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Finanzas · Atlenza" };

export default async function FinancePage() {
  const user = await pageUser();
  const now = today();
  await ensureBasicCategories(user.id);
  const [accounts, categories, flow, recent, importProfiles, competitions] = await Promise.all([
    listAccounts(user.id),
    prisma.financialCategory.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
    cashflow(user.id, 1),
    prisma.financialTransaction.findMany({
      where: { userId: user.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 12,
      include: { postings: { include: { account: { select: { name: true, type: true } }, category: { select: { name: true } } } }, receipts: { select: { id: true, mime: true } } },
    }),
    prisma.bankImportProfile.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    prisma.calendarEvent.findMany({
      where: { userId: user.id, type: "COMPETITION", startAt: { gte: addDays(now, -120), lte: addDays(now, 240) } },
      orderBy: { startAt: "asc" },
      select: { id: true, title: true, startAt: true },
    }),
  ]);
  const { money, netCents } = moneySummary(accounts);
  const thisMonth = flow.at(-1);
  const todayIso = toIsoDay(now);

  return (
    <>
      <PageHeader
        title="Finanzas"
        action={
          <div className="flex gap-2">
            <NewAccount first={!money.length} />
            <div id="nuevo-movimiento" className="scroll-mt-20">
              <QuickTransaction accounts={accounts} categories={categories} today={todayIso} competitions={competitions.map((c) => ({ id: c.id, title: c.title, date: toIsoDay(c.startAt) }))} />
            </div>
          </div>
        }
      />

      <section aria-label="Balance total" className="mb-4">
        <p className="text-sm text-muted-foreground">Balance total</p>
        <p className="text-3xl font-semibold tabular-nums">{formatEur(netCents)}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          Este mes: +{formatEur(thisMonth?.incomeCents ?? 0)} · −{formatEur(thisMonth?.expenseCents ?? 0)}
        </p>
      </section>

      {money.length ? (
        <ul aria-label="Cuentas" className="mb-6 grid grid-cols-2 gap-2">
          {money.map((a) => (
            <li key={a.id}>
              <Card className="gap-1 py-3">
                <CardContent className="grid min-w-0 gap-0.5 px-3">
                  <span className="truncate text-sm text-muted-foreground">
                    {a.name}
                    {a.type === "LIABILITY" ? " · deuda" : ""}
                  </span>
                  <span className="truncate text-lg font-semibold tabular-nums">{formatEur(a.balanceCents)}</span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <section id="movimientos" aria-label="Últimos movimientos" className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Últimos movimientos</h2>
        {recent.length ? (
          <>
            <ul className="grid gap-3">
              {recent.map((t) => (
                <TransactionRow key={t.id} t={t} accounts={accounts} categories={categories} />
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-3 h-11">
              <Link href="/finance/history">Ver historial y filtros</Link>
            </Button>
          </>
        ) : (
          <EmptyState
            icon={Wallet}
            title="Aún no hay movimientos"
            text={money.length ? "Anota un gasto o un ingreso y verás el balance al momento." : "Crea una cuenta con su saldo de hoy (botón «Cuenta») y anota tu primer movimiento."}
            action={{ href: "#nuevo-movimiento", label: "Añadir un movimiento" }}
          />
        )}
      </section>

      <nav aria-label="Más finanzas" className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/more">Presupuestos y temporada</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/trips">Viajes y plazos</Link>
        </Button>
        {money.length ? (
          <BankImport
            accounts={money.map((a) => ({ id: a.id, name: a.name }))}
            profiles={importProfiles.map((p) => ({ id: p.id, name: p.name, accountId: p.accountId, mapping: p.mapping as unknown as ImportProfile["mapping"] }))}
          />
        ) : null}
        <ManageFinance accounts={accounts} categories={categories} today={todayIso} />
      </nav>
    </>
  );
}
