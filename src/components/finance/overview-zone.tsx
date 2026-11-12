"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ArchiveAccountButton, ArchivedAccounts } from "@/components/finance/account-archive";
import { BankImport, type ImportProfile } from "@/components/finance/bank-import";
import { ManageFinance, NewAccount, QuickTransaction } from "@/components/finance/finance-forms";
import { TransactionRow } from "@/components/finance/transaction-row";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ZoneProvider, useZoneData } from "@/components/zone-refresh";
import { moneySummary } from "@/lib/finance/balances";
import type { FinanceOverview } from "@/lib/finance/overview";
import { formatEur } from "@/lib/format";

/** Zona de `/finance` (O16): todo lo que cambia al anotar, editar o borrar; se recarga con `GET /api/finance/overview`. */
export function FinanceOverviewZone({
  initial,
  today,
  competitions,
  profiles,
}: {
  initial: FinanceOverview;
  today: string;
  competitions: Array<{ id: string; title: string; date: string }>;
  profiles: ImportProfile[];
}) {
  const { data, reload } = useZoneData(initial, "/api/finance/overview");
  const { accounts, categories, month, recent, frequent } = data;
  // El balance cuenta también las archivadas: archivar no hace desaparecer el dinero.
  const { money: allMoney, netCents } = moneySummary(accounts);
  const money = allMoney.filter((a) => !a.isArchived);
  const archivedMoney = allMoney.filter((a) => a.isArchived);

  return (
    <ZoneProvider reload={reload}>
      <PageHeader
        title="Finanzas"
        action={
          <div className="flex gap-2">
            <NewAccount first={!money.length} />
            <div id="nuevo-movimiento" className="scroll-mt-20">
              <QuickTransaction accounts={accounts} categories={categories} frequent={frequent} today={today} competitions={competitions} />
            </div>
          </div>
        }
      />

      <section aria-label="Balance total" className="mb-4">
        <p className="text-sm text-muted-foreground">Balance total</p>
        <p className="text-3xl font-semibold tabular-nums">{formatEur(netCents)}</p>
        <p className="text-sm text-muted-foreground tabular-nums">
          Este mes: +{formatEur(month.incomeCents)} · −{formatEur(month.expenseCents)}
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
                  <ArchiveAccountButton account={a} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <ArchivedAccounts accounts={archivedMoney} />

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
          <Link href="/finance/budgets">Presupuestos del mes</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/more">Presupuestos y temporada</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/finance/trips">Viajes y plazos</Link>
        </Button>
        {money.length ? <BankImport accounts={money.map((a) => ({ id: a.id, name: a.name }))} profiles={profiles} /> : null}
        <ManageFinance accounts={accounts} categories={categories} today={today} />
      </nav>
    </ZoneProvider>
  );
}
