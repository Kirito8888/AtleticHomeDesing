"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field, MultiChips } from "@/components/form/chips";
import { Stepper } from "@/components/form/stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { formatNum } from "@/lib/format";
import {
  LAB_MARKERS,
  type LabMarker,
  PELVIC_ROUTINE,
  PELVIC_SYMPTOMS,
  type PelvicSymptom,
  PP_PHASES,
  SCREEN_QUESTIONS,
  type ScreenKey,
  type WomenSettings,
} from "@/lib/health/women";

function useCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function call(url: string, init: { method?: string; body?: unknown }, ok: string) {
    setBusy(true);
    try {
      await api(url, init);
      toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, call };
}

const YES_NO = [
  { value: 1, label: "Sí" },
  { value: 0, label: "No" },
];

/** Cribado orientativo de RED-S (8 preguntas sí/no). */
export function ScreenForm({ today }: { today: string }) {
  const { busy, call } = useCall();
  const [answers, setAnswers] = useState<Partial<Record<ScreenKey, boolean>>>({});
  const keys = Object.keys(SCREEN_QUESTIONS) as ScreenKey[];
  const complete = keys.every((k) => answers[k] != null);
  return (
    <div className="grid gap-3">
      {keys.map((k) => (
        <Field key={k} label={SCREEN_QUESTIONS[k].text}>
          <Chips label={SCREEN_QUESTIONS[k].text} options={YES_NO} value={answers[k] == null ? null : answers[k] ? 1 : 0} onChange={(v) => setAnswers((a) => ({ ...a, [k]: v === 1 }))} />
        </Field>
      ))}
      <Button type="button" disabled={busy || !complete} onClick={() => call("/api/health/women/log", { body: { kind: "SCREEN", date: today, answers } }, "Cribado guardado")}>
        Guardar el cribado
      </Button>
      <p className="text-xs text-muted-foreground">Orientativo, basado en los dominios del LEAF-Q (lesiones, digestión y regla). No es el cuestionario validado ni un diagnóstico.</p>
    </div>
  );
}

/** Analítica: fecha y valores (los que tengas). */
export function LabForm({ today }: { today: string }) {
  const { busy, call } = useCall();
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Partial<Record<LabMarker, number | null>>>({});
  const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v != null && v > 0));
  return (
    <div className="grid gap-3">
      <Field label="Fecha de la analítica" htmlFor="lab-date">
        <Input id="lab-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {(Object.keys(LAB_MARKERS) as LabMarker[]).map((k) => (
          <Field key={k} label={`${LAB_MARKERS[k].label} (${LAB_MARKERS[k].unit})`}>
            <Stepper label={LAB_MARKERS[k].label} value={values[k] ?? null} onChange={(v) => setValues((cur) => ({ ...cur, [k]: v }))} step={k === "hemoglobin" ? 0.1 : 1} decimals={k === "hemoglobin" ? 1 : 0} max={1000} />
          </Field>
        ))}
      </div>
      <Button type="button" variant="outline" disabled={busy || !Object.keys(filled).length} onClick={async () => (await call("/api/health/women/log", { body: { kind: "LAB", date, values: filled } }, "Analítica guardada")) && setValues({})}>
        Guardar analítica
      </Button>
    </div>
  );
}

export function PelvicForm({ today }: { today: string }) {
  const { busy, call } = useCall();
  const [symptoms, setSymptoms] = useState<PelvicSymptom[]>([]);
  return (
    <div className="grid gap-3">
      <MultiChips
        label="Síntomas de suelo pélvico"
        options={(Object.keys(PELVIC_SYMPTOMS) as PelvicSymptom[]).map((k) => ({ value: k, label: PELVIC_SYMPTOMS[k] }))}
        value={symptoms}
        onChange={setSymptoms}
      />
      <Button type="button" variant="outline" disabled={busy || !symptoms.length} onClick={async () => (await call("/api/health/women/log", { body: { kind: "PELVIC", date: today, symptoms } }, "Anotado")) && setSymptoms([])}>
        Anotar hoy
      </Button>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Rutina de suelo pélvico (5 min, para el calentamiento)</summary>
        <ul className="mt-2 grid gap-2">
          {PELVIC_ROUTINE.map((r) => (
            <li key={r.exercise} className="rounded-md border p-2">
              <div className="font-medium">
                {r.exercise} · {r.sets}
              </div>
              <p className="text-xs text-muted-foreground">{r.how}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function PillBreakForm({ today }: { today: string }) {
  const { busy, call } = useCall();
  const [date, setDate] = useState(today);
  const [days, setDays] = useState<number | null>(7);
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
      <Field label="Inicio del descanso" htmlFor="pill-date">
        <Input id="pill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Chips label="Días de descanso" options={[4, 7].map((d) => ({ value: d, label: `${d} d` }))} value={days} onChange={setDays} />
      <Button type="button" variant="outline" disabled={busy || !days} onClick={() => call("/api/health/women/log", { body: { kind: "PILL_BREAK", date, days } }, "Anotado")}>
        Anotar
      </Button>
    </div>
  );
}

/** Ajustes: modo embarazo/posparto, umbrales y borrado. */
export function WomenSettingsForm({ initial }: { initial: WomenSettings }) {
  const { busy, call } = useCall();
  const [s, setS] = useState(initial);
  const set = (p: Partial<WomenSettings>) => setS((c) => ({ ...c, ...p }));
  return (
    <div className="grid gap-4">
      <Field label="Ahora mismo">
        <Chips
          label="Modo"
          options={[
            { value: "NONE" as const, label: "Entreno normal" },
            { value: "PREGNANT" as const, label: "Embarazo" },
            { value: "POSTPARTUM" as const, label: "Posparto" },
          ]}
          value={s.mode}
          onChange={(v) => v && set({ mode: v })}
        />
      </Field>
      {s.mode === "POSTPARTUM" ? (
        <Field label="Fecha del parto" htmlFor="pp-date">
          <Input id="pp-date" type="date" value={s.postpartumSince ?? ""} onChange={(e) => set({ postpartumSince: e.target.value || null })} />
        </Field>
      ) : null}
      {s.mode !== "NONE" ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          En este modo no se generan planes con IA ni se muestran los avisos de peso y de tope de lanzamientos. Sigue las pautas de tu médica o matrona.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Disponibilidad energética: avisar por debajo de" hint="kcal/kg de masa libre de grasa">
          <Stepper label="Umbral de disponibilidad energética" value={s.eaMin} onChange={(v) => v != null && set({ eaMin: v })} min={15} max={45} />
        </Field>
        <Field label="Ferritina: avisar por debajo de" hint="µg/L (pregunta a tu médica el tuyo)">
          <Stepper label="Umbral de ferritina" value={s.ferritinMin} onChange={(v) => v != null && set({ ferritinMin: v })} min={5} max={200} />
        </Field>
        <Field label="Recordar analítica cada" hint="meses (vacío = no recordar)">
          <Stepper label="Meses entre analíticas" value={s.labEveryMonths} onChange={(v) => set({ labEveryMonths: v == null || v < 1 ? null : v })} max={24} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={s.remindPeriod} onChange={(e) => set({ remindPeriod: e.target.checked })} />
        Recordarme apuntar la regla si llevo tiempo sin hacerlo
      </label>
      <Button type="button" disabled={busy} onClick={() => call("/api/health/women", { method: "PUT", body: s }, "Ajustes guardados")}>
        Guardar ajustes
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="justify-self-start text-destructive"
        disabled={busy}
        onClick={() => confirm("¿Borrar todos tus datos de esta sección (ajustes, cribados, analíticas, suelo pélvico)? No se puede deshacer.") && call("/api/health/women", { method: "DELETE" }, "Datos borrados")}
      >
        Borrar mis datos de esta sección
      </Button>
    </div>
  );
}

/** Posparto: fase actual y criterios con casillas. */
export function PostpartumCard({ settings, status }: { settings: WomenSettings; status: { weeks: number; phase: number; title: string; advice: string; next: Array<{ key: string; text: string; done: boolean }>; blockedBy: "time" | "criteria" | null } }) {
  const { busy, call } = useCall();
  const toggle = (key: string, done: boolean) => {
    const body = key === "cleared" ? { cleared: done } : { ppDone: done ? [...settings.ppDone, key] : settings.ppDone.filter((k) => k !== key) };
    void call("/api/health/women", { method: "PUT", body }, "Guardado");
  };
  const next = PP_PHASES[status.phase + 1];
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Vuelta posparto · semana {status.weeks}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 text-sm">
        <ol className="grid gap-1" aria-label="Fases posparto">
          {PP_PHASES.map((p, i) => (
            <li key={p.key} className={i === status.phase ? "font-semibold" : i < status.phase ? "text-muted-foreground line-through" : "text-muted-foreground"}>
              {i === status.phase ? "▶ " : ""}
              {p.title}
            </li>
          ))}
        </ol>
        <p>{status.advice}</p>
        {status.next.length ? (
          <ul className="grid gap-1.5" aria-label="Criterios para pasar de fase">
            {status.next.map((c) => (
              <li key={c.key}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-5" disabled={busy} checked={c.done} onChange={(e) => toggle(c.key, e.target.checked)} />
                  {c.text}
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        {next && status.blockedBy === "time" ? <p className="text-xs text-muted-foreground">Criterios superados: la siguiente fase empieza en la semana {next.minWeeks}.</p> : null}
        <p className="text-xs text-muted-foreground">Basado en las guías de vuelta a la carrera posparto (Goom, Donnelly y Brockwell, 2019). Ante pérdidas, pesadez o dolor, vuelve a la fase anterior y consulta con fisioterapia de suelo pélvico.</p>
      </CardContent>
    </Card>
  );
}

export function LabTable({ series }: { series: Record<LabMarker, Array<{ date: string; value: number }>> }) {
  const rows = (Object.keys(LAB_MARKERS) as LabMarker[]).filter((k) => series[k].length);
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sin analíticas todavía.</p>;
  return (
    <ul className="grid gap-1.5 text-sm" aria-label="Analíticas">
      {rows.map((k) => {
        const s = series[k];
        const last = s.at(-1)!;
        const prev = s.at(-2);
        return (
          <li key={k} className="flex items-baseline justify-between gap-2 border-b pb-1 last:border-0">
            <span>{LAB_MARKERS[k].label}</span>
            <span className="tabular-nums">
              <span className="font-semibold">{formatNum(last.value, 1)}</span> {LAB_MARKERS[k].unit}
              {prev ? <span className="text-xs text-muted-foreground"> (antes {formatNum(prev.value, 1)})</span> : null}
              <span className="ml-1 text-xs text-muted-foreground">{last.date}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
