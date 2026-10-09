"use client";

import { useMemo, useState } from "react";
import { Copy, Dumbbell, Plus, Trash2 } from "lucide-react";

import { Stepper } from "@/components/form/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNum } from "@/lib/format";
import { estimateOneRm, repsInReserve, tonnageKg } from "@/lib/training/strength";
import { cn } from "@/lib/utils";

export interface ExerciseOption {
  id: string;
  name: string;
  bodyweightFactor: number;
}

export interface SetRow {
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  isWarmup: boolean;
  /** VBT: velocidad media (m/s), opcional. */
  velocityMs?: number | null;
}

export interface ExerciseBlock {
  key: string;
  exerciseId: string;
  sets: SetRow[];
}

const RPE_OPTIONS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

let keySeq = 0;
const newKey = () => `b${++keySeq}`;

export function newBlock(exerciseId: string): ExerciseBlock {
  return { key: newKey(), exerciseId, sets: [{ reps: 5, weightKg: 20, rpe: null, isWarmup: true }] };
}

/** Convierte los bloques en las series que espera la API (excluye filas incompletas). */
export function blocksToSets(blocks: ExerciseBlock[]) {
  return blocks.flatMap((b) =>
    b.sets
      .filter((s) => s.reps != null && s.reps > 0)
      .map((s) => ({ exerciseId: b.exerciseId, reps: s.reps!, weightKg: s.weightKg ?? 0, rpe: s.rpe, isWarmup: s.isWarmup, ...(s.velocityMs ? { velocityMs: s.velocityMs } : {}) })),
  );
}

function ExercisePicker({ exercises, onPick }: { exercises: ExerciseOption[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return exercises.filter((e) => e.name.toLowerCase().includes(n)).slice(0, 8);
  }, [q, exercises]);
  return (
    <div className="grid gap-2">
      <Input placeholder="Buscar ejercicio (p.ej. sentadilla, pullover…)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ejercicio" />
      {matches.length ? (
        <ul className="grid gap-1 rounded-md border p-1">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onPick(e.id);
                  setQ("");
                }}
              >
                <Plus className="size-4 text-muted-foreground" /> {e.name}
              </button>
            </li>
          ))}
        </ul>
      ) : q.trim() ? (
        <p className="text-xs text-muted-foreground">Sin coincidencias. Puedes crear ejercicios propios en Ajustes.</p>
      ) : null}
    </div>
  );
}

export function StrengthLogger({
  exercises,
  blocks,
  onChange,
  bodyWeightKg,
  onSetCompleted,
}: {
  exercises: ExerciseOption[];
  blocks: ExerciseBlock[];
  onChange: (b: ExerciseBlock[]) => void;
  bodyWeightKg: number | null;
  /** Se llama al pulsar "Repetir serie" (= serie terminada): arranca el descanso. */
  onSetCompleted?: () => void;
}) {
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const update = (key: string, fn: (b: ExerciseBlock) => ExerciseBlock) => onChange(blocks.map((b) => (b.key === key ? fn(b) : b)));
  const setField = (key: string, i: number, patch: Partial<SetRow>) =>
    update(key, (b) => ({ ...b, sets: b.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const sets = blocksToSets(blocks).map((s) => ({ ...s, bodyweightFactor: byId.get(s.exerciseId)?.bodyweightFactor ?? 0 }));
  const tonnage = tonnageKg(sets, bodyWeightKg);

  return (
    <div className="grid gap-4">
      {blocks.map((block) => {
        const ex = byId.get(block.exerciseId);
        const best = Math.max(
          0,
          ...block.sets
            .filter((s) => !s.isWarmup && s.reps)
            .map(
              (s) =>
                estimateOneRm((s.weightKg ?? 0) + (ex?.bodyweightFactor ?? 0) * (bodyWeightKg ?? 0), s.reps!, repsInReserve({ rpe: s.rpe })) ?? 0,
            ),
        );
        return (
          <section key={block.key} className="grid gap-2 rounded-lg border p-3" aria-label={ex?.name}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex min-w-0 items-center gap-2 font-semibold">
                <Dumbbell className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{ex?.name ?? "Ejercicio"}</span>
              </h3>
              <div className="flex shrink-0 items-center gap-2">
                {best > 0 ? <span className="text-xs text-muted-foreground tabular-nums">e1RM {formatNum(best)} kg</span> : null}
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar ejercicio" onClick={() => onChange(blocks.filter((b) => b.key !== block.key))}>
                  <Trash2 />
                </Button>
              </div>
            </div>

            {block.sets.map((s, i) => (
              <div key={i} className={cn("grid gap-2 rounded-md p-2", s.isWarmup ? "bg-muted/60" : "bg-transparent")}>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium">
                    Serie {i + 1}
                    {s.isWarmup ? " · calentamiento" : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className={cn("rounded border px-2 py-1", s.isWarmup && "border-primary text-foreground")}
                      aria-pressed={s.isWarmup}
                      onClick={() => setField(block.key, i, { isWarmup: !s.isWarmup })}
                    >
                      Calent.
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Borrar serie ${i + 1}`}
                      onClick={() => update(block.key, (b) => ({ ...b, sets: b.sets.filter((_, j) => j !== i) }))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stepper label={`Peso serie ${i + 1}`} value={s.weightKg} onChange={(v) => setField(block.key, i, { weightKg: v })} step={2.5} decimals={2} max={1000} suffix="kg" />
                  <Stepper label={`Repeticiones serie ${i + 1}`} value={s.reps} onChange={(v) => setField(block.key, i, { reps: v })} max={200} suffix="reps" />
                </div>
                {!s.isWarmup ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    VBT
                    <input
                      aria-label={`Velocidad serie ${i + 1}`}
                      inputMode="decimal"
                      className="h-8 w-20 rounded-md border bg-transparent px-2 text-sm tabular-nums"
                      placeholder="m/s"
                      defaultValue={s.velocityMs != null ? String(s.velocityMs).replace(".", ",") : ""}
                      onChange={(e) => {
                        const v = Number(e.target.value.replace(",", "."));
                        setField(block.key, i, { velocityMs: e.target.value.trim() && Number.isFinite(v) && v > 0 && v < 10 ? v : null });
                      }}
                    />
                    <span>m/s (opcional)</span>
                  </label>
                ) : null}
                {!s.isWarmup ? (
                  <div role="radiogroup" aria-label={`RPE serie ${i + 1}`} className="flex gap-1 overflow-x-auto pb-0.5">
                    <span className="self-center pr-1 text-xs text-muted-foreground">RPE</span>
                    {RPE_OPTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={s.rpe === r}
                        onClick={() => setField(block.key, i, { rpe: s.rpe === r ? null : r })}
                        className={cn(
                          "h-8 min-w-9 shrink-0 rounded-full border px-2 text-xs font-medium tabular-nums",
                          s.rpe === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                        )}
                      >
                        {String(r).replace(".", ",")}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                update(block.key, (b) => {
                  const last = b.sets.at(-1);
                  return { ...b, sets: [...b.sets, last ? { ...last, isWarmup: false } : { reps: 5, weightKg: 20, rpe: null, isWarmup: false }] };
                });
                onSetCompleted?.();
              }}
            >
              <Copy /> Repetir serie
            </Button>
          </section>
        );
      })}

      <ExercisePicker exercises={exercises} onPick={(id) => onChange([...blocks, newBlock(id)])} />

      {sets.length ? (
        <p className="text-sm text-muted-foreground">
          Tonelaje (sin calentamiento): <span className="font-semibold text-foreground tabular-nums">{formatNum(tonnage, 1)} kg</span>
        </p>
      ) : null}
    </div>
  );
}
