"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatNum } from "@/lib/format";
import type { EvolutionRow } from "@/lib/health/isak-chart";
import { useCssTokens } from "@/lib/use-css-tokens";

const TOKENS = ["--series-1", "--series-2", "--series-3", "--chart-grid", "--muted-foreground"] as const;

/** Evolución de peso, masa grasa y masa muscular, en kg o en % del peso (los pesos solo en kg). */
export function CompositionEvolutionChart({ rows, unit }: { rows: EvolutionRow[]; unit: "kg" | "%" }) {
  const t = useCssTokens(TOKENS);
  const kg = unit === "kg";
  return (
    <div className="h-52 w-full">
      {t ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={t["--chart-grid"]} vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d)} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} minTickGap={24} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} tickFormatter={(v: number) => formatNum(v)} />
            <Tooltip formatter={(v, n) => [`${formatNum(Number(v), 2)} ${unit}`, n]} labelFormatter={(d) => formatDate(String(d), { day: "numeric", month: "short", year: "numeric" })} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {kg ? <Line name="Peso" type="monotone" dataKey="weightKg" stroke={t["--series-1"]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} /> : null}
            <Line name="Masa grasa" type="monotone" dataKey={kg ? "fatKg" : "fatPct"} stroke={t["--series-2"]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            <Line name="Masa muscular" type="monotone" dataKey={kg ? "muscleKg" : "musclePct"} stroke={t["--series-3"]} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
