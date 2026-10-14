"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

type Athlete = { id: string; name: string; eligible: boolean; reason: string | null; canSimulate: boolean };
type Origin = { templates: Array<{ id: string; name: string }>; plans: Array<{ code: string; name: string }> };
type Point = { date: string; ctl: number; atl: number; tsb: number };
type Scenario = { id: string; label: string; notes: string[]; summary: { ctlEnd: number; atlPeak: number; tsbMin: number; acwrMax: number | null }; series: Point[] };
type Preview = {
  source: { name: string } | null;
  athletes: Array<{ id: string; name: string; days: Array<{ date: string; title: string; tss: number }>; clashDates: string[]; simulation: { scenarios: Scenario[]; competition: string | null } | null; simulationNote: string | null }>;
  rejected: Array<{ id: string; reason: string }>;
};

const f = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-ES");

/** Línea de TSB (forma) de cada escenario; el eje cero marca el límite fatiga/forma. */
function TsbChart({ scenarios }: { scenarios: Scenario[] }) {
  const all = scenarios.flatMap((s) => s.series.map((p) => p.tsb));
  if (!all.length) return null;
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const n = Math.max(...scenarios.map((s) => s.series.length));
  const x = (i: number) => 4 + (i / Math.max(1, n - 1)) * 312;
  const y = (v: number) => 4 + ((hi - v) / Math.max(1, hi - lo)) * 92;
  const dash = ["", "4 3", "1 3", "6 2 1 2"];
  return (
    <svg viewBox="0 0 320 100" role="img" aria-label="Forma (TSB) proyectada por escenario" className="w-full max-w-full text-foreground">
      <line x1="4" x2="316" y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.3" />
      {scenarios.map((s, k) => (
        <polyline key={s.id} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={dash[k % 4]} strokeOpacity={0.4 + 0.2 * k} points={s.series.map((p, i) => `${x(i)},${y(p.tsb)}`).join(" ")} />
      ))}
    </svg>
  );
}

export function MultiPlan({ athletes, templates, plans, defaultStart }: { athletes: Athlete[]; defaultStart: string } & Origin) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [origin, setOrigin] = useState(templates[0] ? `t:${templates[0].id}` : plans[0] ? `p:${plans[0].code}` : "");
  const [start, setStart] = useState(defaultStart);
  const [rpe, setRpe] = useState(6);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const body = () => ({
    source: origin.startsWith("t:") ? { kind: "template", id: origin.slice(2) } : { kind: "plan", code: origin.slice(2) },
    start,
    rpe,
    athleteIds: [...picked],
  });
  const reset = () => {
    setPreview(null);
    setConfirm(false);
    setResult(null);
  };

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      setPreview(await api<Preview>("/api/coach/multi-plan", { body: { action: "preview", ...body() } }));
      setConfirm(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }
  async function apply() {
    setBusy(true);
    try {
      const r = await api<{ created: unknown[]; rejected: Array<{ id: string; reason: string }> }>("/api/coach/multi-plan", { body: { action: "apply", ...body(), confirm: true } });
      setResult(`Borradores creados: ${r.created.length}${r.rejected.length ? ` · sin crear: ${r.rejected.length}` : ""}. Cada atleta los activa desde su planificación.`);
      setPreview(null);
      setConfirm(false);
      setPicked(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  }

  const nOk = preview?.athletes.length ?? 0;
  return (
    <div className="grid gap-4 text-sm">
      <fieldset className="grid gap-1 rounded-md border p-3">
        <legend className="px-1 text-xs text-muted-foreground">Atletas</legend>
        {athletes.length ? (
          athletes.map((a) => (
            <label key={a.id} className={`flex min-h-9 items-start gap-2 ${a.eligible ? "" : "opacity-60"}`}>
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                disabled={!a.eligible}
                checked={picked.has(a.id)}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(a.id);
                  else next.delete(a.id);
                  setPicked(next);
                  reset();
                }}
              />
              <span className="min-w-0">
                {a.name}
                {a.reason ? <span className="block text-xs text-muted-foreground">{a.reason}</span> : null}
              </span>
            </label>
          ))
        ) : (
          <p className="text-muted-foreground">Aún no tienes atletas con vínculo activo.</p>
        )}
      </fieldset>

      <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
        <label className="grid gap-1">
          Qué copiar
          <select className="h-10 rounded-md border bg-background px-2" value={origin} onChange={(e) => { setOrigin(e.target.value); reset(); }}>
            {templates.length ? <optgroup label="Semanas tipo">{templates.map((t) => <option key={t.id} value={`t:${t.id}`}>{t.name}</option>)}</optgroup> : null}
            {plans.length ? <optgroup label="Planes propios">{plans.map((p) => <option key={p.code} value={`p:${p.code}`}>{p.code} · {p.name}</option>)}</optgroup> : null}
          </select>
        </label>
        <label className="grid gap-1">
          Desde el día
          <input type="date" className="h-10 rounded-md border bg-background px-2" value={start} onChange={(e) => { setStart(e.target.value); reset(); }} />
        </label>
        <label className="grid gap-1">
          RPE previsto (1-10)
          <input type="number" min={1} max={10} step={0.5} className="h-10 rounded-md border bg-background px-2" value={rpe} onChange={(e) => { setRpe(Number(e.target.value) || 6); reset(); }} />
        </label>
      </div>
      {!origin ? <p className="text-muted-foreground">Guarda antes una semana tipo o crea un plan propio en Planificación.</p> : null}
      <Button className="min-h-11" disabled={busy || !picked.size || !origin} onClick={run}>
        {busy ? "Calculando…" : `Previsualizar (${picked.size})`}
      </Button>

      {result ? <p role="status" className="rounded-md border border-primary/40 p-3">{result}</p> : null}

      {preview ? (
        <section className="grid gap-3" aria-label="Previsualización">
          <p className="text-muted-foreground">Previsualización de «{preview.source?.name}»: nada se ha guardado todavía.</p>
          {preview.rejected.length ? (
            <ul className="rounded-md border border-destructive/40 p-2 text-xs" aria-label="Atletas descartadas">
              {preview.rejected.map((r) => <li key={r.id}>{athletes.find((a) => a.id === r.id)?.name ?? "Atleta"}: {r.reason}</li>)}
            </ul>
          ) : null}
          {preview.athletes.map((a) => (
            <article key={a.id} className="grid gap-2 rounded-md border p-3">
              <h3 className="font-medium">{a.name}</h3>
              <p className="text-xs text-muted-foreground">
                {a.days.length} día(s): {a.days.map((d) => `${d.date.slice(5)} (${d.tss} TSS)`).join(" · ")}
              </p>
              {a.clashDates.length ? <p className="text-xs">Choca con sesiones ya planificadas: {a.clashDates.join(", ")}</p> : null}
              {a.simulationNote ? <p className="text-xs text-muted-foreground">{a.simulationNote}</p> : null}
              {a.simulation ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full tabular-nums" aria-label={`Escenarios de ${a.name}`}>
                      <thead className="text-xs text-muted-foreground">
                        <tr><th className="py-1 text-left font-normal">Escenario</th><th className="px-2 text-right font-normal">CTL final</th><th className="px-2 text-right font-normal">ATL pico</th><th className="px-2 text-right font-normal">TSB mín.</th></tr>
                      </thead>
                      <tbody>
                        {a.simulation.scenarios.map((s) => (
                          <tr key={s.id} className="border-t align-top">
                            <td className="py-1">{s.label}{s.notes.length ? <span className="block text-xs text-muted-foreground">{s.notes.join(" · ")}</span> : null}</td>
                            <td className="px-2 text-right">{f(s.summary.ctlEnd)}</td>
                            <td className="px-2 text-right">{f(s.summary.atlPeak)}</td>
                            <td className="px-2 text-right">{f(s.summary.tsbMin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <TsbChart scenarios={a.simulation.scenarios} />
                </>
              ) : null}
            </article>
          ))}
          {nOk ? (
            <div className="grid gap-2 rounded-md border p-3">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 size-4" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                <span>Confirmo crear un borrador en {nOk} atleta(s). No se activa ni se crean sesiones hasta que cada una lo acepte.</span>
              </label>
              <Button className="min-h-11" disabled={busy || !confirm} onClick={apply}>
                Asignar a {nOk} atleta(s)
              </Button>
            </div>
          ) : (
            <p>Ninguna atleta seleccionada se puede planificar.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
