"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDate, formatNum } from "@/lib/format";
import { useCssTokens } from "@/lib/use-css-tokens";

export interface PmcPoint {
  date: string;
  tss?: number | null;
  ctl?: number | null;
  atl?: number | null;
  tsb?: number | null;
  readinessScore?: number | null;
  hrvRmssdMs?: number | null;
  sleepHours?: number | null;
}

const TOKENS = ["--series-1", "--series-2", "--series-3", "--chart-grid", "--muted-foreground", "--foreground"] as const;

const SYNC = "pmc";
const tickDate = (d: string) => formatDate(d);

interface TipProps {
  active?: boolean;
  label?: unknown;
  payload?: ReadonlyArray<{ dataKey?: unknown; name?: unknown; value?: unknown; color?: string }>;
  units?: Record<string, string>;
}

/** Recharts pasa sus props al contenido del tooltip; solo se usan estas. */
const tip = (units?: Record<string, string>) =>
  function TooltipContent(props: unknown) {
    return <ChartTooltip {...(props as TipProps)} units={units} />;
  };

function ChartTooltip({ active, payload, label, units }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{formatDate(String(label), { weekday: "short", day: "numeric", month: "short" })}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full" style={{ background: p.color }} />
            {String(p.name)}
          </span>
          <span className="font-medium tabular-nums">
            {p.value == null ? "—" : formatNum(Number(p.value))}
            {units?.[String(p.dataKey)] ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, height = 160, children }: { title: string; height?: number; children: React.ReactElement }) {
  return (
    <figure className="grid gap-1">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function Legend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * PMC como small multiples con eje X compartido y cursor sincronizado.
 * Sin doble eje: CTL/ATL/TSB comparten unidad (TSS/día) en un panel; el TSS
 * diario, el readiness, la VFC y el sueño van cada uno en su panel.
 */
export function PmcCharts({ data }: { data: PmcPoint[] }) {
  const p = useCssTokens(TOKENS);
  if (!p) return <div className="h-[640px] animate-pulse rounded-lg bg-muted" />;

  const axis = { stroke: p["--muted-foreground"], fontSize: 11, tickLine: false, axisLine: false } as const;
  const grid = <CartesianGrid stroke={p["--chart-grid"]} vertical={false} />;
  const x = <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={28} {...axis} />;
  const cursor = { stroke: p["--muted-foreground"], strokeDasharray: "3 3" };
  const hasRecovery = data.some((d) => d.readinessScore != null || d.hrvRmssdMs != null || d.sleepHours != null);

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Legend
          items={[
            { color: p["--series-1"], label: "Fitness (CTL)" },
            { color: p["--series-2"], label: "Fatiga (ATL)" },
            { color: p["--series-3"], label: "Forma (TSB)" },
          ]}
        />
        <Panel title="Carga: fitness, fatiga y forma" height={220}>
          <LineChart data={data} syncId={SYNC} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            {grid}
            {x}
            <YAxis {...axis} />
            <ReferenceLine y={0} stroke={p["--muted-foreground"]} strokeOpacity={0.5} />
            <Tooltip cursor={cursor} content={tip()} />
            <Line type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke={p["--series-1"]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="atl" name="Fatiga (ATL)" stroke={p["--series-2"]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="tsb" name="Forma (TSB)" stroke={p["--series-3"]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </Panel>
      </div>

      <Panel title="TSS diario" height={120}>
        <BarChart data={data} syncId={SYNC} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          {grid}
          {x}
          <YAxis {...axis} />
          <Tooltip cursor={{ fill: p["--chart-grid"] }} content={tip()} />
          <Bar dataKey="tss" name="TSS" fill={p["--series-1"]} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </Panel>

      {hasRecovery ? (
        <>
          <Panel title="Readiness (0–100)" height={120}>
            <LineChart data={data} syncId={SYNC} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              {grid}
              {x}
              <YAxis domain={[0, 100]} ticks={[0, 50, 75, 100]} {...axis} />
              <Tooltip cursor={cursor} content={tip()} />
              <Line type="monotone" dataKey="readinessScore" name="Readiness" stroke={p["--series-1"]} strokeWidth={2} connectNulls dot={{ r: 3, strokeWidth: 2, fill: p["--series-1"] }} isAnimationActive={false} />
            </LineChart>
          </Panel>
          <div className="grid gap-6 sm:grid-cols-2">
            <Panel title="VFC (rMSSD, ms)" height={120}>
              <LineChart data={data} syncId={SYNC} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                {grid}
                {x}
                <YAxis domain={["auto", "auto"]} {...axis} />
                <Tooltip cursor={cursor} content={tip({ hrvRmssdMs: " ms" })} />
                <Line type="monotone" dataKey="hrvRmssdMs" name="VFC" stroke={p["--series-1"]} strokeWidth={2} connectNulls dot={{ r: 3, strokeWidth: 2, fill: p["--series-1"] }} isAnimationActive={false} />
              </LineChart>
            </Panel>
            <Panel title="Sueño (h)" height={120}>
              <BarChart data={data} syncId={SYNC} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                {grid}
                {x}
                <YAxis domain={[0, 10]} ticks={[0, 4, 8]} {...axis} />
                <ReferenceLine y={8} stroke={p["--muted-foreground"]} strokeDasharray="4 4" />
                <Tooltip cursor={{ fill: p["--chart-grid"] }} content={tip({ sleepHours: " h" })} />
                <Bar dataKey="sleepHours" name="Sueño" fill={p["--series-1"]} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
              </BarChart>
            </Panel>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Registra tu recuperación diaria para ver readiness, VFC y sueño aquí.</p>
      )}

      <details className="rounded-lg border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Ver como tabla</summary>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-background text-muted-foreground">
              <tr>
                {["Fecha", "TSS", "CTL", "ATL", "TSB", "Readiness", "VFC", "Sueño"].map((h) => (
                  <th key={h} className="px-2 py-1 text-right font-normal first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="px-2 py-1">{formatDate(d.date)}</td>
                  {[d.tss, d.ctl, d.atl, d.tsb, d.readinessScore, d.hrvRmssdMs, d.sleepHours].map((v, i) => (
                    <td key={i} className="px-2 py-1 text-right">
                      {v == null ? "—" : formatNum(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
