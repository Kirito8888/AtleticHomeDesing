"use client";

import { useEffect, useState } from "react";

import { ReferenceChart } from "@/components/charts/lazy";
import { api } from "@/lib/client-api";
import { formatDate, formatNum } from "@/lib/format";
import type { CurvePoint, OverlayRow } from "@/lib/training/reference-curves";
import { cn } from "@/lib/utils";

export interface CurveOption {
  id: string;
  title: string;
  testKey: string;
}
interface Result {
  curve: { id: string; title: string; unit: string; higherIsBetter: boolean; study: string; authors: string; year: number; citation: string; doi: string | null; sourceUrl: string | null; level: string | null; points: CurvePoint[] };
  rows: OverlayRow[];
  summary: { comparable: number; outside: number; meanDeltaPct: number | null; last: OverlayRow | null };
  resultCount: number;
  warnings: string[];
}
const BAND = { above: "Por encima de la banda", within: "Dentro de la banda", below: "Por debajo de la banda", outside: "Fuera del rango de edades" } as const;

export function CurveCompare({ curves, athlete }: { curves: CurveOption[]; athlete?: string }) {
  const [id, setId] = useState(curves[0]?.id ?? "");
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    api<Result>(`/api/training/reference-curves/${id}/compare${athlete ? `?athlete=${athlete}` : ""}`)
      .then((r) => live && (setData(r), setError(null)))
      .catch((e: Error) => live && (setData(null), setError(e.message)));
    return () => {
      live = false;
    };
  }, [id, athlete]);
  const c = data?.curve;
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="curve-select" className="text-sm font-medium">
          Curva de referencia
        </label>
        <select id="curve-select" value={id} onChange={(e) => setId(e.target.value)} className="min-h-11 rounded-md border bg-background px-3 text-sm">
          {curves.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} ({o.testKey})
            </option>
          ))}
        </select>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {data && c ? (
        <>
          {data.warnings.map((w) => (
            <p key={w} className="rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-sm">{w}</p>
          ))}
          {data.rows.length ? (
            <>
              <ReferenceChart points={c.points} rows={data.rows} unit={c.unit} higherIsBetter={c.higherIsBetter} title={c.title} />
              {data.summary.last ? (
                <p className="text-sm" data-testid="curve-summary">
                  Último resultado: <span className="font-semibold tabular-nums">{formatNum(data.summary.last.value, 2)} {c.unit}</span> frente a{" "}
                  <span className="tabular-nums">{formatNum(data.summary.last.ref ?? 0, 2)} {c.unit}</span> de la mediana →{" "}
                  <span className={cn("font-semibold tabular-nums", (data.summary.last.deltaPct ?? 0) < 0 && "text-destructive")}>
                    {(data.summary.last.deltaPct ?? 0) >= 0 ? "+" : ""}{formatNum(data.summary.last.deltaPct ?? 0, 1)} %
                  </span>{" "}
                  ({BAND[data.summary.last.band]}).
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Ningún resultado cae dentro del rango de edades de la curva.</p>
              )}
              <ul className="grid gap-1 text-sm" aria-label="Resultados frente a la curva">
                {data.rows.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b py-1">
                    <span>{formatDate(r.date, { day: "numeric", month: "short", year: "numeric" })} · {formatNum(r.age, 1)} a</span>
                    <span className="tabular-nums">{formatNum(r.value, 2)} {c.unit} · {r.deltaPct === null ? "—" : `${r.deltaPct >= 0 ? "+" : ""}${formatNum(r.deltaPct, 1)} %`}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : data.resultCount === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay resultados de este test para comparar.</p>
          ) : null}
          <section aria-label="Cita de la curva" className="rounded-lg border p-3 text-sm" data-testid="curve-citation">
            <p className="font-semibold">Fuente</p>
            <p>{c.study}</p>
            <p className="text-muted-foreground">{c.authors} ({c.year})</p>
            <p className="mt-1 break-words">{c.citation}</p>
            {c.doi ? (
              <p className="mt-1 break-all">
                DOI:{" "}
                <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  {c.doi}
                </a>
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">Es una referencia poblacional, no un diagnóstico ni una recomendación médica. Los cálculos se hacen en tu servidor; nada se envía a la IA.</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
