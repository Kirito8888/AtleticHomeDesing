import Link from "next/link";
import { Wallet } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { TransactionRow } from "@/components/finance/transaction-row";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { pageUser } from "@/lib/auth/page";
import { toIsoDay } from "@/lib/dates";
import { moneySummary } from "@/lib/finance/balances";
import { ensureBasicCategories, listAccounts, listTransactions } from "@/lib/finance/service";
import { formatEur, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata = { title: "Historial · Finanzas · Atlenza" };

const PAGE = 100;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

type Params = { kind?: string; account?: string; month?: string; from?: string; to?: string; limit?: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
function href(p: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/finance/history?${s}` : "/finance/history";
}

export default async function FinanceHistoryPage({ searchParams }: PageProps<"/finance/history">) {
  const user = await pageUser();
  const sp = await searchParams;
  await ensureBasicCategories(user.id);
  const [accounts, categories] = await Promise.all([
    listAccounts(user.id),
    prisma.financialCategory.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
  ]);
  const { money, netCents } = moneySummary(accounts);

  const kind = one(sp.kind) === "expense" ? "EXPENSE" : one(sp.kind) === "income" ? "INCOME" : undefined;
  const accountId = money.find((a) => a.id === one(sp.account))?.id;
  const monthRaw = one(sp.month);
  const month = monthRaw && MONTH.test(monthRaw) ? monthRaw : undefined;
  const fromRaw = one(sp.from);
  const toRaw = one(sp.to);
  let from = fromRaw && DAY.test(fromRaw) ? fromRaw : undefined;
  let to = toRaw && DAY.test(toRaw) ? toRaw : undefined;
  if (month && !from && !to) {
    const [y, m] = month.split("-").map(Number);
    from = `${month}-01`;
    to = toIsoDay(new Date(Date.UTC(y, m, 0)));
  }
  const limit = Math.min(Math.max(Number(one(sp.limit)) || PAGE, PAGE), 1000);

  const rows = await listTransactions(user.id, { accountId, kind, from, to, limit: limit + 1 });
  const more = rows.length > limit;
  const shown = rows.slice(0, limit);
  const filtered = Boolean(kind || accountId || from || to);
  const current: Params = { kind: one(sp.kind), account: accountId, month, from: fromRaw, to: toRaw };
  const shownAccount = money.find((a) => a.id === accountId);

  const groups = new Map<string, typeof shown>();
  for (const t of shown) {
    const key = toIsoDay(t.date).slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const chips: Array<{ label: string; value?: string }> = [{ label: "Todos" }, { label: "Gastos", value: "expense" }, { label: "Ingresos", value: "income" }];

  return (
    <>
      <PageHeader
        title="Historial"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/finance">Volver</Link>
          </Button>
        }
      />

      <section aria-label="Saldo" className="mb-3">
        <p className="text-sm text-muted-foreground">{shownAccount ? shownAccount.name : "Balance total"}</p>
        <p className="text-2xl font-semibold tabular-nums">{formatEur(shownAccount ? shownAccount.balanceCents : netCents)}</p>
      </section>

      <nav aria-label="Tipo de movimiento" className="mb-3 flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const active = (kind ?? undefined) === (c.value === "expense" ? "EXPENSE" : c.value === "income" ? "INCOME" : undefined);
          return (
            <Link
              key={c.label}
              href={href({ ...current, kind: c.value })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-11 min-w-11 items-center justify-center rounded-full border px-4 text-sm font-medium",
                active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              )}
            >
              {c.label}
            </Link>
          );
        })}
      </nav>

      <form method="get" action="/finance/history" aria-label="Filtros" className="mb-4 grid min-w-0 gap-2">
        {kind ? <input type="hidden" name="kind" value={one(sp.kind)} /> : null}
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Cuenta</span>
          <Select name="account" defaultValue={accountId ?? ""} aria-label="Cuenta">
            <option value="">Todas las cuentas</option>
            {money.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Mes</span>
          <Input type="month" name="month" defaultValue={month ?? ""} aria-label="Mes" className="h-11" />
        </label>
        <details className="rounded-md border" open={Boolean(fromRaw || toRaw)}>
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm">Rango de fechas</summary>
          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-muted-foreground">Desde</span>
              <Input type="date" name="from" defaultValue={fromRaw ?? ""} aria-label="Desde" className="h-11" />
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="text-muted-foreground">Hasta</span>
              <Input type="date" name="to" defaultValue={toRaw ?? ""} aria-label="Hasta" className="h-11" />
            </label>
          </div>
        </details>
        <div className="flex gap-2">
          <Button type="submit" className="h-11 flex-1">
            Aplicar filtros
          </Button>
          {filtered ? (
            <Button asChild variant="outline" className="h-11">
              <Link href="/finance/history">Quitar filtros</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {shown.length ? (
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
              <Link href={href({ ...current, limit: String(limit + PAGE) })}>Mostrar más</Link>
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
    </>
  );
}
