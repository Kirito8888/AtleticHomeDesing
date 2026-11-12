"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { TransactionRow } from "@/components/finance/transaction-row";
import { Button } from "@/components/ui/button";
import { ZoneProvider, useZoneData } from "@/components/zone-refresh";
import type { HistoryView } from "@/lib/finance/history-view";
import { formatEur, formatMonth } from "@/lib/format";

/**
 * Zona del historial (O16): saldo + lista agrupada por mes. Los filtros y chips siguen en el servidor (cambian la URL).
 * `query` es la cadena de filtros ya validada; `moreHref` el enlace de «Mostrar más».
 */
export function FinanceHistoryZone({ initial, query, moreHref }: { initial: HistoryView; query: string; moreHref: string }) {
  const { data, reload } = useZoneData(initial, `/api/finance/history?${query}`);
  const { accounts, categories, rows, more, filtered, balanceLabel, balanceCents } = data;

  const groups = new Map<string, typeof rows>();
  for (const t of rows) {
    const key = (typeof t.date === "string" ? t.date : t.date.toISOString()).slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  return (
    <ZoneProvider reload={reload}>
      <section aria-label="Saldo" className="mb-3">
        <p className="text-sm text-muted-foreground">{balanceLabel}</p>
        <p className="text-2xl font-semibold tabular-nums">{formatEur(balanceCents)}</p>
      </section>
      <div data-zone-body>
        {rows.length ? (
          <div className="grid gap-4">
            {[...groups.entries()].map(([key, list]) => (
              <section key={key} aria-label={formatMonth(key, "long")}>
                <h2 className="mb-2 text-sm font-medium capitalize">{formatMonth(key, "long")}</h2>
                <ul className="grid gap-3">
                  {list.map((t) => (
                    <TransactionRow key={t.id} t={t} accounts={accounts} categories={categories} />
                  ))}
                </ul>
              </section>
            ))}
            {more ? (
              <Button asChild variant="outline" className="h-11">
                <Link href={moreHref}>Mostrar más</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <EmptyState
            icon={Wallet}
            title={filtered ? "Ningún movimiento con estos filtros" : "Aún no hay movimientos"}
            text={filtered ? "Prueba con otro mes, cuenta o tipo." : "Anota un gasto o un ingreso desde Finanzas."}
            action={filtered ? { href: "/finance/history", label: "Quitar filtros" } : { href: "/finance", label: "Ir a Finanzas" }}
          />
        )}
      </div>
    </ZoneProvider>
  );
}
