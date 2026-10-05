"use client";

import { ChevronDown, Plus, Star, Trash2 } from "lucide-react";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatNum, TECHNICAL_EVENT_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Attempt {
  /** Id local estable: los inputs de marca no son controlados y deben sobrevivir a borrados. */
  id: number;
  markM: number | null;
  isFoul: boolean;
  rating: number | null;
  windMs: number | null;
  runUpNotes: string;
  blockNotes: string;
  releaseNotes: string;
}

export interface TechnicalState {
  event: string;
  implementWeightG: number | null;
  approachType: string;
  approachSteps: number | null;
  isCompetition: boolean;
  focus: string;
  attempts: Attempt[];
}

/** Pesos oficiales habituales por prueba (gramos). */
const IMPLEMENTS: Record<string, number[]> = {
  JAVELIN: [400, 500, 600, 700, 800],
  SHOT_PUT: [3000, 4000, 5000, 6000, 7260],
  DISCUS: [750, 1000, 1500, 1750, 2000],
  HAMMER: [3000, 4000, 5000, 6000, 7260],
  WEIGHT_THROW: [9080, 11340, 15880],
};

const JUMPS = new Set(["LONG_JUMP", "TRIPLE_JUMP", "HIGH_JUMP", "POLE_VAULT"]);
const WIND_EVENTS = new Set(["LONG_JUMP", "TRIPLE_JUMP"]);

let attemptSeq = 0;
export const emptyAttempt = (): Attempt => ({ id: ++attemptSeq, markM: null, isFoul: false, rating: null, windMs: null, runUpNotes: "", blockNotes: "", releaseNotes: "" });

export const initialTechnical = (): TechnicalState => ({
  event: "JAVELIN",
  implementWeightG: 800,
  approachType: "FULL",
  approachSteps: null,
  isCompetition: false,
  focus: "",
  attempts: [],
});

export function technicalPayload(t: TechnicalState) {
  return {
    event: t.event,
    implementWeightG: IMPLEMENTS[t.event] ? t.implementWeightG : null,
    approachType: t.approachType || null,
    approachSteps: t.approachSteps,
    isCompetition: t.isCompetition,
    focus: t.focus || null,
    attempts: t.attempts.map((a) => ({
      markM: a.isFoul ? null : a.markM,
      isFoul: a.isFoul,
      isMeasured: !a.isFoul && a.markM != null,
      rating: a.rating,
      windMs: a.windMs,
      runUpNotes: a.runUpNotes || null,
      blockNotes: a.blockNotes || null,
      releaseNotes: a.releaseNotes || null,
    })),
  };
}

const parseNum = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || Number.isNaN(n) ? null : n;
};

export function TechnicalLogger({ value, onChange }: { value: TechnicalState; onChange: (t: TechnicalState) => void }) {
  const set = (patch: Partial<TechnicalState>) => onChange({ ...value, ...patch });
  const setAttempt = (i: number, patch: Partial<Attempt>) =>
    set({ attempts: value.attempts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const implementOptions = IMPLEMENTS[value.event];
  const isJump = JUMPS.has(value.event);
  const notes = isJump
    ? { runUp: "Carrera / penúltimo apoyo", block: "Batida", release: "Vuelo / caída" }
    : { runUp: "Fase de carrera / cruces", block: "Bloqueo", release: "Suelta / ángulo" };
  const valid = value.attempts.filter((a) => !a.isFoul && a.markM != null).map((a) => a.markM!);
  const best = valid.length ? Math.max(...valid) : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prueba" htmlFor="event">
          <Select
            id="event"
            value={value.event}
            onChange={(e) => {
              const ev = e.target.value;
              const imps = IMPLEMENTS[ev];
              set({ event: ev, implementWeightG: imps ? imps[imps.length - 1] : null, approachType: JUMPS.has(ev) ? "FULL" : value.approachType });
            }}
          >
            {Object.entries(TECHNICAL_EVENT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo de carrera / técnica" htmlFor="approach">
          <Select id="approach" value={value.approachType} onChange={(e) => set({ approachType: e.target.value })}>
            <option value="STANDING">Parado</option>
            <option value="SHORT">Carrera corta</option>
            <option value="MEDIUM">Carrera media</option>
            <option value="FULL">Carrera completa</option>
            <option value="GLIDE">Desplazamiento (glide)</option>
            <option value="ROTATIONAL">Giro</option>
          </Select>
        </Field>
      </div>

      {implementOptions ? (
        <Field label="Peso del implemento">
          <Chips
            label="Peso del implemento"
            value={value.implementWeightG}
            onChange={(v) => set({ implementWeightG: v })}
            options={implementOptions.map((g) => ({ value: g, label: g >= 1000 ? `${formatNum(g / 1000, 2)} kg` : `${g} g` }))}
          />
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Apoyos de carrera" htmlFor="steps">
          <Input
            id="steps"
            inputMode="numeric"
            value={value.approachSteps ?? ""}
            onChange={(e) => set({ approachSteps: parseNum(e.target.value) })}
            placeholder="p.ej. 13"
          />
        </Field>
        <div className="flex items-end gap-2 pb-2">
          <Switch id="comp" checked={value.isCompetition} onCheckedChange={(c) => set({ isCompetition: c })} />
          <label htmlFor="comp" className="text-sm">
            Competición
          </label>
        </div>
      </div>

      <Field label="Objetivo técnico" htmlFor="focus">
        <Input id="focus" value={value.focus} onChange={(e) => set({ focus: e.target.value })} placeholder="p.ej. bloqueo de la pierna izquierda" />
      </Field>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Intentos ({value.attempts.length})</h3>
        {best != null ? (
          <span className="text-sm">
            Mejor: <span className="font-semibold tabular-nums">{formatNum(best, 2)} m</span>
          </span>
        ) : null}
      </div>

      <ol className="grid gap-2">
        {value.attempts.map((a, i) => (
          <li key={a.id} className={cn("grid gap-2 rounded-lg border p-3", a.isFoul && "border-dashed")}>
            <div className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">#{i + 1}</span>
              <Input
                aria-label={`Marca intento ${i + 1} en metros`}
                inputMode="decimal"
                placeholder={a.isFoul ? "Nulo" : "Marca (m)"}
                disabled={a.isFoul}
                className="h-10 text-lg font-semibold tabular-nums"
                defaultValue={a.markM ?? ""}
                onChange={(e) => setAttempt(i, { markM: parseNum(e.target.value) })}
              />
              <button
                type="button"
                aria-pressed={a.isFoul}
                onClick={() => setAttempt(i, { isFoul: !a.isFoul })}
                className={cn("h-10 shrink-0 rounded-md border px-3 text-sm font-medium", a.isFoul && "border-destructive text-destructive")}
              >
                Nulo
              </button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Borrar intento ${i + 1}`} onClick={() => set({ attempts: value.attempts.filter((_, j) => j !== i) })}>
                <Trash2 />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div role="radiogroup" aria-label={`Valoración intento ${i + 1}`} className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={a.rating === n}
                    aria-label={`${n} de 5`}
                    className="p-1"
                    onClick={() => setAttempt(i, { rating: a.rating === n ? null : n })}
                  >
                    <Star className={cn("size-5", a.rating != null && n <= a.rating ? "fill-foreground text-foreground" : "text-muted-foreground")} />
                  </button>
                ))}
              </div>
              {WIND_EVENTS.has(value.event) ? (
                <Input
                  aria-label={`Viento intento ${i + 1} (m/s)`}
                  inputMode="decimal"
                  placeholder="Viento m/s"
                  className="h-8 w-28 text-sm"
                  onChange={(e) => setAttempt(i, { windMs: parseNum(e.target.value) })}
                />
              ) : null}
            </div>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground">
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /> Notas técnicas
              </summary>
              <div className="mt-2 grid gap-2">
                <Textarea aria-label={notes.runUp} placeholder={notes.runUp} value={a.runUpNotes} onChange={(e) => setAttempt(i, { runUpNotes: e.target.value })} />
                <Textarea aria-label={notes.block} placeholder={notes.block} value={a.blockNotes} onChange={(e) => setAttempt(i, { blockNotes: e.target.value })} />
                <Textarea aria-label={notes.release} placeholder={notes.release} value={a.releaseNotes} onChange={(e) => setAttempt(i, { releaseNotes: e.target.value })} />
              </div>
            </details>
          </li>
        ))}
      </ol>

      <Button type="button" size="lg" variant="secondary" className="h-12 text-base" onClick={() => set({ attempts: [...value.attempts, emptyAttempt()] })}>
        <Plus /> Añadir intento
      </Button>
    </div>
  );
}
