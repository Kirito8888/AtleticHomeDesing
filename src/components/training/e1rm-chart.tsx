"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatNum } from "@/lib/format";
import type { E1rmPoint } from "@/lib/training/strength-progress";
import { useCssTokens } from "@/lib/use-css-tokens";

const TOKENS = ["--series-1", "--chart-grid", "--muted-foreground"] as const;

function Tip(props: unknown) {
  const { active, payload } = props as { active?: boolean; payload?: ReadonlyArray<{ payload: E1rmPoint }> };
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{formatDate(p.date, { weekday: "short", day: "numeric", month: "short" })}</div>
      <div className="tabular-nums">e1RM {formatNum(p.e1rm, 1)} kg</div>
      <div className="text-muted-foreground">Mejor serie: {p.best}</div>
    </div>
  );
}

export function E1rmChart({ data, name }: { data: E1rmPoint[]; name: string }) {
  const t = useCssTokens(TOKENS);
  return (
    <figure className="grid gap-1" aria-label={`1RM estimado de ${name}`}>
      <div className="h-48 w-full">
        {t ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={t["--chart-grid"]} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} minTickGap={24} />
              <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} tickFormatter={(v: number) => formatNum(v)} />
              <Tooltip content={Tip} />
              <Line type="monotone" dataKey="e1rm" name="e1RM" stroke={t["--series-1"]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </figure>
  );
}
