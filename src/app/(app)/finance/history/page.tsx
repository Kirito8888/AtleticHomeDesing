import Link from "next/link";

import { FinanceHistoryZone } from "@/components/finance/history-zone";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { pageUser } from "@/lib/auth/page";
import { ensureBasicCategories } from "@/lib/finance/service";
import { historyView, HISTORY_PAGE, parseHistoryParams } from "@/lib/finance/history-view";
import { moneySummary } from "@/lib/finance/balances";
import { cn } from "@/lib/utils";

export const metadata = { title: "Historial · Finanzas · Atlenza" };

const PAGE = HISTORY_PAGE;

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
  const view = await historyView(user.id, { kind: one(sp.kind), account: one(sp.account), month: one(sp.month), from: one(sp.from), to: one(sp.to), limit: one(sp.limit) });
  const { money } = moneySummary(view.accounts);
  const { kind, month, limit } = parseHistoryParams({ kind: one(sp.kind), month: one(sp.month), limit: one(sp.limit) });
  const accountId = money.find((a) => a.id === one(sp.account))?.id;
  const fromRaw = one(sp.from);
  const toRaw = one(sp.to);
  const filtered = view.filtered;
  const current: Params = { kind: one(sp.kind), account: accountId, month, from: fromRaw, to: toRaw };
  const zoneQuery = new URLSearchParams(Object.entries({ kind: one(sp.kind), account: accountId, month: one(sp.month), from: fromRaw, to: toRaw, limit: one(sp.limit) }).filter((e): e is [string, string] => Boolean(e[1]))).toString();

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

      <FinanceHistoryZone initial={view} query={zoneQuery} moreHref={href({ ...current, limit: String(limit + PAGE) })} />
    </>
  );
}
