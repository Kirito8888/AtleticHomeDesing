"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatNum } from "@/lib/format";
import type { CurvePoint, OverlayRow } from "@/lib/training/reference-curves";
import { useCssTokens } from "@/lib/use-css-tokens";

const TOKENS = ["--series-1", "--series-2", "--chart-grid", "--muted-foreground"] as const;

/** Curva citada (mediana + banda) con los resultados de la atleta encima. Eje x = edad; en tiempos, eje y invertido. */
export function ReferenceChart({ points, rows, unit, higherIsBetter, title }: { points: CurvePoint[]; rows: OverlayRow[]; unit: string; higherIsBetter: boolean; title: string }) {
  const t = useCssTokens(TOKENS);
  const data = [
    ...points.map((p) => ({ x: p.x, p50: p.p50, band: p.low !== undefined && p.high !== undefined ? [p.low, p.high] : undefined, value: undefined as number | undefined })),
    ...rows.map((r) => ({ x: Number(r.age.toFixed(2)), p50: undefined as number | undefined, band: undefined, value: r.value })),
  ].sort((a, b) => a.x - b.x);
  return (
    <figure className="grid gap-1" aria-label={`Comparativa con la curva: ${title}`}>
      <div className="h-56 w-full">
        {t ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={t["--chart-grid"]} vertical={false} />
              <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} tickFormatter={(v: number) => `${formatNum(v, 1)} a`} />
              <YAxis reversed={!higherIsBetter} domain={["auto", "auto"]} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} tickFormatter={(v: number) => formatNum(v)} />
              <Tooltip formatter={(v) => (Array.isArray(v) ? `${formatNum(Number(v[0]), 2)}–${formatNum(Number(v[1]), 2)} ${unit}` : `${formatNum(Number(v), 2)} ${unit}`)} labelFormatter={(x) => `${formatNum(Number(x), 1)} años`} />
              <Area dataKey="band" name="Banda" stroke="none" fill={t["--series-1"]} fillOpacity={0.15} connectNulls isAnimationActive={false} />
              <Line dataKey="p50" name="Referencia" stroke={t["--series-1"]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="value" name="Tú" stroke={t["--series-2"]} strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </div>
      <figcaption className="text-xs text-muted-foreground">Azul: curva publicada y su banda · Naranja: tus resultados.</figcaption>
    </figure>
  );
}
