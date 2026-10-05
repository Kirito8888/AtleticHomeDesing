"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatEur } from "@/lib/format";
import { useCssTokens } from "@/lib/use-css-tokens";

export interface CashflowRow {
  month: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

const TOKENS = ["--series-1", "--series-2", "--chart-grid", "--muted-foreground"] as const;

const monthLabel = (m: string) =>
  new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

/** Ingresos vs gastos por mes: barras agrupadas, un único eje en euros. */
export function CashflowChart({ data }: { data: CashflowRow[] }) {
  const t = useCssTokens(TOKENS);
  if (!t) return <div className="h-56 animate-pulse rounded-lg bg-muted" />;
  const [income, expense, grid, muted] = TOKENS.map((k) => t[k]);
  const rows = data.map((d) => ({ ...d, income: d.incomeCents / 100, expense: d.expenseCents / 100 }));
  const axis = { stroke: muted, fontSize: 11, tickLine: false, axisLine: false } as const;

  return (
    <figure className="grid gap-2">
      <ul className="flex gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: income }} /> Ingresos
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: expense }} /> Gastos
        </li>
      </ul>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
            <YAxis width={56} tickFormatter={(v: number) => `${Math.round(v).toLocaleString("es-ES")} €`} {...axis} />
            <Tooltip
              cursor={{ fill: grid }}
              content={(props: unknown) => {
                const { active, payload } = props as { active?: boolean; payload?: Array<{ payload: CashflowRow & { month: string } }> };
                if (!active || !payload?.length) return null;
                const r = payload[0].payload;
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                    <div className="mb-1 font-medium capitalize">
                      {new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${r.month}-01T00:00:00Z`))}
                    </div>
                    <div className="tabular-nums">Ingresos: {formatEur(r.incomeCents)}</div>
                    <div className="tabular-nums">Gastos: {formatEur(r.expenseCents)}</div>
                    <div className="font-medium tabular-nums">Neto: {formatEur(r.netCents)}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="income" name="Ingresos" fill={income} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey="expense" name="Gastos" fill={expense} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
