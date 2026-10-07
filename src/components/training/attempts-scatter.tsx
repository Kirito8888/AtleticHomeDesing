"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatNum } from "@/lib/format";
import { useCssTokens } from "@/lib/use-css-tokens";

const TOKENS = ["--series-1", "--chart-grid", "--muted-foreground"] as const;
type Point = { t: number; markM: number; date: string };

function Tip(props: unknown) {
  const { active, payload } = props as { active?: boolean; payload?: ReadonlyArray<{ payload: Point }> };
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {formatDate(p.date, { day: "numeric", month: "short", year: "numeric" })} · <span className="tabular-nums">{formatNum(p.markM, 2)} m</span>
    </div>
  );
}

/** Todos los intentos válidos de un implemento: cuanto más juntos, más consistente. */
export function AttemptsScatter({ data, name }: { data: Array<{ date: string; markM: number }>; name: string }) {
  const t = useCssTokens(TOKENS);
  const points: Point[] = data.map((d) => ({ ...d, t: Date.parse(`${d.date}T00:00:00Z`) }));
  return (
    <figure className="grid gap-1" aria-label={`Intentos: ${name}`}>
      <div className="h-48 w-full">
        {t ? (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={t["--chart-grid"]} vertical={false} />
              <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => formatDate(new Date(v).toISOString().slice(0, 10))} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} />
              <YAxis type="number" dataKey="markM" domain={["dataMin - 2", "dataMax + 2"]} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} tickFormatter={(v: number) => formatNum(v)} />
              <Tooltip content={Tip} />
              <Scatter data={points} fill={t["--series-1"]} fillOpacity={0.6} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </figure>
  );
}
