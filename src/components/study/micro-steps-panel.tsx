"use client";

import { useEffect, useState } from "react";
import { Pause, Play, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Chips } from "@/components/form/chips";
import { SourcePicker, useSource } from "@/components/study/source-picker";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MicroSteps } from "@/lib/study/micro-steps";
import {
  beginFocus,
  completeStep,
  intervalProgress,
  isFinished,
  isPaused,
  type MicroRun,
  pause,
  PRESETS,
  remainingMs,
  resume,
  startStep,
  tick,
} from "@/lib/study/micro-timer";
import { MICRO_KEY as KEY, microSessionFromSaved, type SavedMicro } from "@/lib/study/study-history";
import type { MicroSessionView } from "@/lib/study/study-history-service";

interface Saved {
  steps: MicroSteps;
  selected: number;
  preset: string;
  done: number[];
  run: MicroRun | null;
  /** v2.9 · uuid de la sesión (idempotencia en la BD), marca de «ya subida» y hora en que se terminó. */
  key?: string;
  syncedKey?: string;
  completedAt?: number;
}
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);
const day = (iso: string) => formatDateTime(iso);
const presetKey = (p: { focus: number; rest: number }) => `${p.focus}/${p.rest}`;
const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function store(v: Saved | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: los pasos siguen en memoria */
  }
}

/**
 * Cuenta atrás y barra: el reloj de 1 s vive aquí para que solo se repinten estos dos nodos y no
 * todo el panel (el padre solo avanza de fase con `tick`, que no cambia la referencia si no hace falta).
 * La `key` lo reinicia con la hora actual cada vez que el tramo cambia (pausa, reanudar, fase, paso).
 */
function MicroCountdown({ run }: { run: MicroRun }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = now;
  return (
    <>
      <p role="timer" className="text-center text-5xl font-semibold tabular-nums">
        {mmss(remainingMs(run, t))}
      </p>
      <div
        role="progressbar"
        aria-label="Avance del intervalo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(intervalProgress(run, t) * 100)}
        className="h-3 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${intervalProgress(run, t) * 100}%` }} />
      </div>
    </>
  );
}

/**
 * Fraccionador + temporizador de micro-intervalos. Los pasos viven en el cliente (y en localStorage
 * para sobrevivir a una recarga): no se guarda nada en apuntes ni flashcards.
 */
export function MicroStepsPanel({ docs, aiEnabled, history }: { docs: Array<{ id: string; title: string }>; aiEnabled: boolean; history: MicroSessionView[] }) {
  const src = useSource(docs);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<MicroSteps | null>(null);
  const [selected, setSelected] = useState(0);
  const [preset, setPreset] = useState(presetKey(PRESETS[1]));
  const [done, setDone] = useState<number[]>([]);
  const [run, setRun] = useState<MicroRun | null>(null);
  const [key, setKey] = useState<string | undefined>();
  const [syncedKey, setSyncedKey] = useState<string | undefined>();
  const [completedAt, setCompletedAt] = useState<number | undefined>();
  const [sessions, setSessions] = useState<MicroSessionView[]>(history);
  const [hideImport, setHideImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Recupera el estado tras recargar (fuera del render para no romper la hidratación)
  useEffect(() => {
    const id = setTimeout(() => {
      const v = load();
      if (v?.steps?.steps?.length) {
        setSteps(v.steps);
        setSelected(v.selected);
        setPreset(v.preset);
        setDone(v.done ?? []);
        setRun(v.run);
        setKey(v.key);
        setSyncedKey(v.syncedKey);
        setCompletedAt(v.completedAt);
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (steps) store({ steps, selected, preset, done, run, key, syncedKey, completedAt });
  }, [steps, selected, preset, done, run, key, syncedKey, completedAt]);

  const savedNow: SavedMicro | null = steps ? { steps, preset, done, key, syncedKey, completedAt } : null;

  /** Sube una sesión terminada; solo con el 200 se marca como sincronizada (si falla, queda local y se reintenta al reabrir). */
  async function upload(input: NonNullable<ReturnType<typeof microSessionFromSaved>>): Promise<boolean> {
    try {
      const r = await api<{ sessions: MicroSessionView[] }>("/api/study/micro-sessions", { body: { ...input, completedAt: input.completedAt.toISOString() } });
      setSessions(r.sessions);
      setCompletedAt(input.completedAt.getTime());
      setSyncedKey(input.clientKey);
      return true;
    } catch (err) {
      toast.error(`No se pudo guardar la sesión en el servidor (queda en este dispositivo): ${(err as Error).message}`);
      return false;
    }
  }

  // Sesión terminada y aún no subida: sin `key` es de una versión anterior; con `key` es que la subida automática falló.
  // Se ofrece importarla (nunca se borra nada local) y se oculta mientras la subida automática está en curso.
  const legacy = !hideImport && !syncing ? microSessionFromSaved(savedNow) : null;
  const legacyPending = legacy && !sessions.some((x) => x.clientKey === legacy.clientKey) ? legacy : null;
  async function importLegacy() {
    if (!legacyPending) return;
    setImporting(true);
    if (await upload(legacyPending)) toast.success("Sesión importada");
    setImporting(false);
  }

  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => {
      const t = Date.now();
      setRun((r) => {
        if (!r) return r;
        const next = tick(r, t);
        if (next !== r) navigator.vibrate?.([300, 150, 300]);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [run]);

  async function split(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<MicroSteps>("/api/ai/study/chunk", { body: { source: src.source } });
      setSteps({ title: r.title, steps: r.steps });
      setKey(newKey());
      setSyncedKey(undefined);
      setCompletedAt(undefined);
      setSelected(0);
      setDone([]);
      setRun(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const p = PRESETS.find((x) => presetKey(x) === preset) ?? PRESETS[1];
  const total = steps?.steps.length ?? 0;
  const go = (fn: (r: MicroRun) => MicroRun) => {
    if (!run) return;
    const n = fn(run);
    setDone(n.done);
    setRun(n);
    // Al terminar el último paso se sube solo (una vez); el 200 marca la sesión como sincronizada.
    const input = steps && key ? microSessionFromSaved({ steps, preset, done: n.done, key, syncedKey, completedAt: Date.now() }) : null;
    if (input) {
      setSyncing(true);
      void upload(input).finally(() => setSyncing(false));
    }
  };
  const exit = () => {
    setSelected(run?.stepIndex ?? selected);
    setRun(null);
  };
  const discard = () => {
    setSteps(null);
    setKey(undefined);
    setSyncedKey(undefined);
    setCompletedAt(undefined);
    setDone([]);
    setRun(null);
    store(null);
  };

  // ---- vista enfocada: solo la tarea actual
  if (steps && run) {
    const step = steps.steps[run.stepIndex];
    if (isFinished(run, total)) {
      return (
        <div className="grid gap-4 rounded-lg border p-4 text-center" data-testid="micro-focus">
          <p className="text-lg font-semibold">Terminaste los {total} pasos</p>
          <Button type="button" className="min-h-11" onClick={exit}>
            Volver a los pasos
          </Button>
        </div>
      );
    }
    const paused = isPaused(run);
    return (
      <div className="grid gap-5 rounded-lg border p-4" data-testid="micro-focus">
        <p className="text-sm text-muted-foreground">
          Paso {run.stepIndex + 1} de {total}
          {run.phase === "rest" ? " · Descanso" : ""}
        </p>
        <p className="break-words text-xl font-semibold leading-snug">{run.phase === "rest" ? "Descansa. Levántate, bebe agua." : step.action}</p>
        {run.phase === "focus" && step.check ? <p className="break-words text-sm text-muted-foreground">{step.check}</p> : null}
        {run.phase === "idle" ? (
          <Button type="button" size="lg" className="min-h-11" onClick={() => go((r) => beginFocus(r, Date.now()))}>
            <Play /> Empezar
          </Button>
        ) : (
          <>
            <MicroCountdown key={`${run.stepIndex}:${run.phase}:${run.endAt}:${run.pausedLeftMs}`} run={run} />
            {run.phase === "focus" ? (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => go((r) => (paused ? resume(r, Date.now()) : pause(r, Date.now())))}>
                {paused ? <Play /> : <Pause />} {paused ? "Reanudar" : "Pausar"}
              </Button>
            ) : (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => go((r) => ({ ...r, phase: "idle", endAt: null, pausedLeftMs: null }))}>
                Saltar descanso
              </Button>
            )}
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" className="min-h-11" onClick={() => go((r) => completeStep(r, total))}>
            Paso hecho
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={exit}>
            <X /> Salir
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {legacyPending ? (
        <div role="status" data-testid="micro-import" className="grid gap-2 rounded-lg border border-dashed p-3 text-sm">
          <p>Tienes una sesión terminada («{legacyPending.title}») guardada solo en este dispositivo. ¿La subes para verla también en tus otros dispositivos?</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" className="min-h-11" disabled={importing} onClick={importLegacy}>
              {importing ? "Importando…" : "Importar"}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setHideImport(true)}>
              Ahora no
            </Button>
          </div>
        </div>
      ) : null}
      {steps ? (
        <div className="grid gap-3 rounded-lg border p-3">
          <h3 className="text-lg font-semibold">{steps.title}</h3>
          <div role="radiogroup" aria-label="Paso" className="grid gap-2">
            {steps.steps.map((s, i) => {
              const active = i === selected;
              const isDone = done.includes(i);
              return (
                <button
                  key={s.n}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(i)}
                  className={cn(
                    "flex min-h-11 w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm",
                    active ? "border-primary bg-accent" : "bg-background",
                    isDone && "text-muted-foreground line-through",
                  )}
                >
                  <span className="shrink-0 font-semibold tabular-nums">{s.n}.</span>
                  <span className="min-w-0 flex-1 break-words">{s.action}</span>
                  <span className="shrink-0 text-xs tabular-nums">{s.minutes} min</span>
                </button>
              );
            })}
          </div>
          <Chips label="Intervalo" value={preset} onChange={(v) => v && setPreset(v)} options={PRESETS.map((x) => ({ value: presetKey(x), label: `${x.focus}/${x.rest} min` }))} />
          <Button type="button" size="lg" className="min-h-11" onClick={() => setRun(startStep(selected, p, Date.now(), done))}>
            <Play /> Empezar este paso
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={discard}>
            Descartar pasos
          </Button>
          <p className="text-xs text-muted-foreground">Los pasos no se guardan en tus apuntes ni en flashcards.</p>
        </div>
      ) : null}
      <form onSubmit={split} className="grid gap-3 rounded-lg border p-3">
        <p className="text-sm text-muted-foreground">Divide un tema largo en 4–6 pasos de 5–15 min y hazlos de uno en uno.</p>
        <SourcePicker docs={docs} idPrefix="steps" s={src} />
        <Button type="submit" className="min-h-11" disabled={!aiEnabled || !src.ready || busy}>
          <Sparkles /> {busy ? "Dividiendo…" : steps ? "Dividir de nuevo" : "Dividir en pasos"}
        </Button>
        {!aiEnabled ? <p className="text-xs text-muted-foreground">Necesitas la IA activada en Ajustes para dividir.</p> : null}
      </form>
      {sessions.length ? (
        <section aria-label="Sesiones completadas" data-testid="micro-history" className="grid gap-1.5">
          <h3 className="text-sm font-medium">Sesiones completadas</h3>
          <ul className="grid gap-1.5">
            {sessions.slice(0, 10).map((x) => (
              <li key={x.id} className="grid gap-0.5 rounded-lg border p-2 text-sm">
                <span className="break-words font-medium">{x.title}</span>
                <span suppressHydrationWarning className="text-xs text-muted-foreground">
                  {day(x.completedAt)} · {x.stepsDone}/{x.stepsTotal} pasos · {x.focusMin}/{x.restMin} min
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
