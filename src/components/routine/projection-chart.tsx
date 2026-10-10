"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";

import { useCssTokens } from "@/lib/use-css-tokens";

const TOKENS = ["--series-1", "--series-2", "--chart-grid", "--muted-foreground"] as const;

type Curve = Array<{ week: number; expected: number; low: number; high: number }>;
type Real = Array<{ week: number; value: number; date: string }>;

const fmt = (v: number, unit: string) => (unit === "s" && v >= 120 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` : `${Math.round(v)}${unit === "rep" ? "" : ` ${unit}`}`);

const makeTip = (unit: string) =>
  function Tip(props: unknown) {
  const { active, payload } = props as { active?: boolean; payload?: ReadonlyArray<{ payload: { week: number; expected?: number; low?: number; high?: number; value?: number } }> };
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">Semana {Math.round(p.week)}</p>
      {p.value != null ? <p>Real: {fmt(p.value, unit)}</p> : null}
      {p.expected != null ? (
        <p>
          Previsto: {fmt(p.expected, unit)} (entre {fmt(Math.min(p.low!, p.high!), unit)} y {fmt(Math.max(p.low!, p.high!), unit)})
        </p>
      ) : null}
    </div>
  );
  };

/**
 * Lo que puedes lograr si sigues el plan: línea esperada, banda (conservadora–optimista) y tus tests
 * reales encima. Es una estimación orientativa, no una promesa.
 */
export function ProjectionChart({ label, unit, curve, real, shortWeeks, higherIsBetter }: { label: string; unit: string; curve: Curve; real: Real; shortWeeks: number; higherIsBetter: boolean }) {
  const t = useCssTokens(TOKENS);
  const data = curve.map((p) => ({ ...p, band: [Math.min(p.low, p.high), Math.max(p.low, p.high)] as [number, number] }));
  const last = curve[curve.length - 1];
  return (
    <figure className="grid gap-1" aria-label={`Proyección: ${label}`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {fmt(curve[0].expected, unit)} → {fmt(last.expected, unit)} en {last.week} sem
        </span>
      </figcaption>
      <div className="h-44 w-full">
        {t ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={t["--chart-grid"]} vertical={false} />
              <XAxis type="number" dataKey="week" domain={[0, last.week]} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} tickFormatter={(v: number) => `${v} sem`} />
              <YAxis type="number" reversed={!higherIsBetter} domain={["auto", "auto"]} tick={{ fill: t["--muted-foreground"], fontSize: 11 }} tickFormatter={(v: number) => fmt(v, unit)} width={52} />
              <Tooltip content={makeTip(unit)} />
              <Area dataKey="band" stroke="none" fill={t["--series-1"]} fillOpacity={0.15} isAnimationActive={false} />
              <Line dataKey="expected" stroke={t["--series-1"]} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Scatter data={real.map((r) => ({ week: r.week, value: r.value }))} dataKey="value" fill={t["--series-2"]} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Línea: lo esperable si sigues el plan · franja: entre la previsión prudente y la optimista · puntos: tus tests. A las {shortWeeks} semanas (tu objetivo corto) {higherIsBetter ? "deberías rondar" : "deberías bajar a"} {fmt(curve.reduce((b, p) => (Math.abs(p.week - shortWeeks) < Math.abs(b.week - shortWeeks) ? p : b), curve[0]).expected, unit)}.
      </p>
    </figure>
  );
}
