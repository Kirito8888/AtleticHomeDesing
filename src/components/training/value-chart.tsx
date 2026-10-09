"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatNum } from "@/lib/format";
import { useCssTokens } from "@/lib/use-css-tokens";

const TOKENS = ["--series-1", "--chart-grid", "--muted-foreground"] as const;

/** Evolución de un valor con fecha (tests físicos). En tiempos, el eje va invertido: arriba = mejor. */
export function ValueChart({ data, name, unit, higherIsBetter }: { data: Array<{ date: string; value: number }>; name: string; unit: string; higherIsBetter: boolean }) {
  const t = useCssTokens(TOKENS);
  return (
    <figure className="grid gap-1" aria-label={`Evolución: ${name}`}>
      <div className="h-40 w-full">
        {t ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={t["--chart-grid"]} vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} minTickGap={24} />
              <YAxis reversed={!higherIsBetter} domain={["auto", "auto"]} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} tickFormatter={(v: number) => formatNum(v)} />
              <Tooltip formatter={(v) => [`${formatNum(Number(v), 2)} ${unit}`, name]} labelFormatter={(d) => formatDate(String(d), { day: "numeric", month: "short", year: "numeric" })} />
              <Line type="monotone" dataKey="value" stroke={t["--series-1"]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </figure>
  );
}
