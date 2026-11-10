"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { formatDate, formatNum } from "@/lib/format";
import { type CompositionPoint, evolutionSeries, type MassKey, massDeltas, somatochartOutline, trajectory, VIEW } from "@/lib/health/isak-chart";

const EvolutionChart = dynamic(() => import("./composition-evolution-chart").then((m) => m.CompositionEvolutionChart), {
  ssr: false,
  loading: () => <div className="h-52 w-full animate-pulse rounded-md bg-muted/40" aria-hidden="true" />,
});

const fmt = (n: number) => formatNum(n, 2);
const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "±");
const abs = (n: number) => fmt(Math.abs(n));
const longDate = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "numeric" });

const EMPTY = <p className="text-sm text-muted-foreground">Aún no hay mediciones: guarda una para verla aquí.</p>;

/** Somatocarta de Heath-Carter (SVG nativo): punto actual + trayectoria entre mediciones. */
export function Somatochart({ points }: { points: CompositionPoint[] }) {
  const t = trajectory(points);
  if (!t.length) return EMPTY;
  const cur = t[t.length - 1];
  const { outline, axes } = somatochartOutline();
  const label = `Somatocarta: ${t.length} ${t.length === 1 ? "medición" : "mediciones"}. Actual ${fmt(cur.endo)}–${fmt(cur.meso)}–${fmt(cur.ecto)}, ${cur.label}; X ${fmt(cur.x)}, Y ${fmt(cur.y)}.`;
  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={label} className="mx-auto w-full max-w-[360px] text-muted-foreground">
        <path d={outline} fill="none" stroke="var(--chart-grid)" strokeWidth={2} />
        {axes.map((a, i) => (
          <line key={i} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="var(--chart-grid)" strokeWidth={1} strokeDasharray="3 3" />
        ))}
        <g fill="currentColor" fontSize={11} textAnchor="middle">
          <text x={axes[0].x2 - 4} y={axes[0].y2 + 14}>Endo</text>
          <text x={axes[1].x2} y={axes[1].y2 - 6}>Meso</text>
          <text x={axes[2].x2 + 4} y={axes[2].y2 + 14}>Ecto</text>
        </g>
        {t.length > 1 ? <polyline data-testid="trayectoria" points={t.map((p) => `${p.cx},${p.cy}`).join(" ")} fill="none" stroke="var(--series-1)" strokeWidth={1.5} strokeOpacity={0.6} /> : null}
        {t.map((p, i) => {
          const last = i === t.length - 1;
          return (
            <circle key={p.id} data-testid="punto-somato" cx={p.cx} cy={p.cy} r={last ? 6 : 3.5} fill={last ? "var(--series-2)" : "var(--series-1)"} stroke="var(--background)" strokeWidth={1.5}>
              <title>{`${longDate(p.date)} · ${fmt(p.endo)}–${fmt(p.meso)}–${fmt(p.ecto)} (${p.label}) · X ${fmt(p.x)} · Y ${fmt(p.y)}${p.clamped ? " · fuera del dibujo, mostrado en el borde" : ""}`}</title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="text-sm">
        Actual ({longDate(cur.date)}): <strong className="tabular-nums">{fmt(cur.endo)} – {fmt(cur.meso)} – {fmt(cur.ecto)}</strong> · {cur.label} · X {fmt(cur.x)} · Y {fmt(cur.y)}.
        <span className="block text-xs text-muted-foreground">
          X = ecto − endo · Y = 2·meso − (endo + ecto). Punto naranja: medición actual; azul: anteriores.
        </span>
      </figcaption>
    </figure>
  );
}

const MASSES: Array<{ key: MassKey; name: string; fill: string; pattern: string }> = [
  { key: "fat", name: "Masa grasa", fill: "var(--series-2)", pattern: "" },
  { key: "muscle", name: "Masa muscular", fill: "var(--series-3)", pattern: "" },
  { key: "bone", name: "Masa ósea", fill: "var(--series-1)", pattern: "" },
  { key: "residual", name: "Masa residual", fill: "var(--muted-foreground)", pattern: "" },
];

/** Reparto de las 4 masas (barra al 100 % + lista kg · % · variación frente a la medición previa). */
export function MassBreakdown({ points }: { points: CompositionPoint[] }) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return EMPTY;
  const cur = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const d = massDeltas(cur.masses, prev?.masses);
  return (
    <div className="grid gap-3">
      <div role="img" aria-label={`Reparto de masas: ${MASSES.map((m) => `${m.name} ${fmt(cur.masses[m.key].pct)} %`).join(", ")}`} className="flex h-5 w-full overflow-hidden rounded-md border border-border">
        {MASSES.map((m) => (
          <div key={m.key} style={{ width: `${Math.max(cur.masses[m.key].pct, 0)}%`, background: m.fill }} className="h-full border-r border-background last:border-r-0" />
        ))}
      </div>
      <table className="w-full text-left text-sm tabular-nums">
        <caption className="pb-1 text-left text-xs text-muted-foreground">
          {longDate(cur.date)} · {fmt(cur.weightKg)} kg{prev ? ` · variación frente al ${longDate(prev.date)}` : " · sin medición previa para comparar"}
        </caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="font-medium">Masa</th>
            <th scope="col" className="font-medium">kg</th>
            <th scope="col" className="font-medium">%</th>
            <th scope="col" className="font-medium">Δ</th>
          </tr>
        </thead>
        <tbody>
          {MASSES.map((m) => {
            const v = d[m.key];
            return (
              <tr key={m.key}>
                <th scope="row" className="py-0.5 pr-2 font-normal">
                  <span aria-hidden="true" className="mr-1.5 inline-block size-2.5 rounded-sm align-middle" style={{ background: m.fill }} />
                  {m.name}
                </th>
                <td>{fmt(cur.masses[m.key].kg)}</td>
                <td>{fmt(cur.masses[m.key].pct)}</td>
                <td>{v ? `${sign(v.kg)}${abs(v.kg)} kg · ${sign(v.pct)}${abs(v.pct)} pp` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Gráficas temporales (kg o %) con la tabla de datos como alternativa textual. */
export function CompositionEvolution({ points }: { points: CompositionPoint[] }) {
  const [unit, setUnit] = useState<"kg" | "%">("kg");
  const rows = evolutionSeries(points);
  if (!rows.length) return EMPTY;
  return (
    <div className="grid gap-2">
      <div role="group" aria-label="Unidad de la gráfica" className="flex gap-1">
        {(["kg", "%"] as const).map((u) => (
          <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className="min-h-11 rounded-md border border-border px-4 text-sm aria-pressed:bg-primary aria-pressed:text-primary-foreground">
            {u === "kg" ? "Kilos" : "Porcentaje"}
          </button>
        ))}
      </div>
      {rows.length > 1 ? <EvolutionChart rows={rows} unit={unit} /> : <p className="text-sm text-muted-foreground">Con una sola medición no hay evolución todavía: añade otra para ver la gráfica.</p>}
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2">Ver datos de la evolución</summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="font-medium">Fecha</th>
                <th scope="col" className="font-medium">Peso kg</th>
                <th scope="col" className="font-medium">Grasa kg</th>
                <th scope="col" className="font-medium">Grasa %</th>
                <th scope="col" className="font-medium">Músculo kg</th>
                <th scope="col" className="font-medium">Músculo %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <th scope="row" className="pr-2 font-normal">{r.date}</th>
                  <td>{fmt(r.weightKg)}</td>
                  <td>{fmt(r.fatKg)}</td>
                  <td>{fmt(r.fatPct)}</td>
                  <td>{fmt(r.muscleKg)}</td>
                  <td>{fmt(r.musclePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
