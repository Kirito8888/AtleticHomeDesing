"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatNum } from "@/lib/format";
import { useCssTokens } from "@/lib/use-css-tokens";

const TOKENS = ["--series-1", "--series-2", "--chart-grid", "--muted-foreground"] as const;
type Point = { date: string; markM: number };

function Tip(props: unknown) {
  const { active, payload } = props as { active?: boolean; payload?: ReadonlyArray<{ payload: Point }> };
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{formatDate(p.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
      <div className="tabular-nums">{formatNum(p.markM, 2)} m</div>
    </div>
  );
}

/** Mejor marca de cada día con un implemento (y, opcional, líneas de objetivo). */
export function MarksChart({ data, name, goals = [] }: { data: Point[]; name: string; goals?: Array<{ label: string; markM: number }> }) {
  const lo = Math.min(...data.map((d) => d.markM), ...goals.map((g) => g.markM));
  const hi = Math.max(...data.map((d) => d.markM), ...goals.map((g) => g.markM));
  const t = useCssTokens(TOKENS);
  return (
    <figure className="grid gap-1" aria-label={`Evolución de marcas: ${name}`}>
      <div className="h-48 w-full">
        {t ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={t["--chart-grid"]} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} minTickGap={24} />
              <YAxis domain={[Math.floor(lo - 2), Math.ceil(hi + 2)]} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} tickFormatter={(v: number) => formatNum(v)} />
              <Tooltip content={Tip} />
              {goals.map((g) => (
                <ReferenceLine
                  key={g.label}
                  y={g.markM}
                  stroke={t["--series-2"]}
                  strokeDasharray="4 4"
                  label={{ value: `${g.label} ${formatNum(g.markM, 2)} m`, position: "insideTopLeft", fill: t["--muted-foreground"], fontSize: 11 }}
                />
              ))}
              <Line type="monotone" dataKey="markM" name="Marca" stroke={t["--series-1"]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </figure>
  );
}
