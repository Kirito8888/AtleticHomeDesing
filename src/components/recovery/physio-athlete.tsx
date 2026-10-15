"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/client-api";
import type { PhysioPhases, Progress } from "@/lib/recovery/physio-protocol";
import { cn } from "@/lib/utils";

interface View {
  phases: PhysioPhases;
  progress: Progress;
  painToday: number | null;
  phase: number;
  done: number;
  total: number;
  pct: number;
}

/** Vista de la atleta: contenido en solo lectura; solo marca criterios y el dolor de hoy. */
export function SharedProtocol({ shareId, initial }: { shareId: string; initial: View }) {
  const [v, setV] = useState(initial);
  const save = async (body: { progress?: Progress; painToday?: number | null }) => {
    const before = v;
    setV((cur) => ({ ...cur, ...(body.progress ? { progress: body.progress } : {}), ...(body.painToday !== undefined ? { painToday: body.painToday } : {}) })); // optimista
    try {
      setV(await api<View>(`/api/recovery/physio/shared/${shareId}`, { method: "PATCH", body }));
    } catch (e) {
      setV(before);
      toast.error((e as Error).message);
    }
  };
  const allowed = v.painToday == null ? null : v.painToday <= v.phases[v.phase].maxPain;
  return (
    <div className="grid gap-4">
      <p className="text-sm" data-testid="physio-progress">
        Fase actual: <strong>{v.phases[v.phase].name}</strong> · {v.done}/{v.total} criterios ({v.pct} %)
      </p>
      <div className="grid gap-1.5">
        <label htmlFor="pain-today" className="text-sm font-medium">Dolor de hoy (0–10)</label>
        <select id="pain-today" value={v.painToday ?? ""} onChange={(e) => save({ painToday: e.target.value === "" ? null : Number(e.target.value) })} className="min-h-11 rounded-md border bg-background px-3 text-sm">
          <option value="">Sin registrar</option>
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        {allowed !== null ? (
          <p className={cn("text-xs", allowed ? "text-muted-foreground" : "text-destructive")}>
            {allowed ? `Dentro del máximo de la fase (${v.phases[v.phase].maxPain}).` : `Por encima del máximo de la fase (${v.phases[v.phase].maxPain}): no avances y consúltalo con quien te lo compartió.`}
          </p>
        ) : null}
      </div>
      {v.phases.map((p, i) => (
        <section key={i} aria-label={p.name} className={cn("rounded-lg border p-3", i === v.phase && "border-foreground")}>
          <h3 className="text-sm font-semibold">{p.name} <span className="font-normal text-muted-foreground">· dolor máx {p.maxPain}</span></h3>
          {p.goal ? <p className="text-sm text-muted-foreground">{p.goal}</p> : null}
          {p.exercises.length ? (
            <ul className="mt-2 grid gap-1 text-sm">
              {p.exercises.map((e, j) => (
                <li key={j}>
                  {e.name}{e.dose ? <span className="text-muted-foreground"> · {e.dose}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {p.criteria.length ? (
            <ul className="mt-2 grid gap-1" aria-label="Criterios para pasar de fase">
              {p.criteria.map((c, j) => (
                <li key={j}>
                  <label className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={v.progress[i]?.[j] ?? false}
                      onChange={(e) => save({ progress: v.progress.map((r, k) => (k === i ? r.map((x, l) => (l === j ? e.target.checked : x)) : r)) })}
                    />
                    <span>{c.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">Es un plan de tu entrenadora o fisio, no un diagnóstico. Si el dolor sube, para y consúltalo.</p>
    </div>
  );
}
