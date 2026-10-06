"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { adjust, formatRest, idle, pause, remainingMs, REST_PRESETS, resume, start, tick, type RestTimer as State } from "@/lib/training/rest-timer";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "lifeos.restSec";

const DEFAULT_REST = 120;

function savedDuration(): number {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY));
    return REST_PRESETS.includes(v as (typeof REST_PRESETS)[number]) ? v : DEFAULT_REST;
  } catch {
    return DEFAULT_REST;
  }
}

// Preferencia de descanso por navegador. useSyncExternalStore evita el desajuste
// de hidratación (el servidor no tiene localStorage: usa 120 s).
const listeners = new Set<() => void>();
function saveDuration(sec: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(sec));
  } catch {
    // sin almacenamiento: no se recuerda la preferencia
  }
  listeners.forEach((l) => l());
}
function usePreferredRest(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    savedDuration,
    () => DEFAULT_REST,
  );
}

/**
 * Pitido programado en Web Audio para la hora exacta de fin. Se crea dentro de
 * un gesto del usuario (requisito de los navegadores) y suena aunque el móvil
 * ralentice los temporizadores de JavaScript.
 */
function useScheduledBeep() {
  const ctx = useRef<AudioContext | null>(null);
  const osc = useRef<OscillatorNode[]>([]);
  const cancel = () => {
    for (const o of osc.current) {
      try {
        o.stop();
      } catch {
        // ya había sonado
      }
    }
    osc.current = [];
  };
  const schedule = (inMs: number) => {
    cancel();
    try {
      ctx.current ??= new AudioContext();
      void ctx.current.resume();
      const c = ctx.current;
      const at = c.currentTime + inMs / 1000;
      for (const offset of [0, 0.25, 0.5]) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, at + offset);
        g.gain.exponentialRampToValueAtTime(0.4, at + offset + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + offset + 0.18);
        o.connect(g).connect(c.destination);
        o.start(at + offset);
        o.stop(at + offset + 0.2);
        osc.current.push(o);
      }
    } catch {
      // Sin Web Audio: queda la vibración y la cuenta atrás en pantalla.
    }
  };
  return { schedule, cancel };
}

/** Mantiene la pantalla encendida mientras corre el descanso (si el navegador lo permite). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    navigator.wakeLock
      .request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, [active]);
}

/**
 * Temporizador de descanso entre series. `autoStart` cambia cada vez que se
 * completa una serie ("Repetir serie") y arranca el descanso.
 * En iPhone no hay vibración (Safari no implementa navigator.vibrate): solo pitido y pantalla.
 */
export function RestTimer({ autoStart }: { autoStart: number }) {
  const preferred = usePreferredRest();
  const [state, setState] = useState<State>(() => idle(DEFAULT_REST));
  const [now, setNow] = useState(() => Date.now());
  const beep = useScheduledBeep();
  useWakeLock(state.status === "running");

  const begin = (durationSec?: number) => {
    const t = Date.now();
    setState((s) => {
      const next = start(s, t, durationSec ?? (s.status === "idle" ? preferred : s.durationSec));
      beep.schedule(remainingMs(next, t));
      return next;
    });
  };

  // Arranque automático al completar una serie (el primer valor, 0, no cuenta).
  const lastSignal = useRef(autoStart);
  useEffect(() => {
    if (autoStart !== lastSignal.current) {
      lastSignal.current = autoStart;
      begin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona a la señal
  }, [autoStart]);

  useEffect(() => {
    if (state.status !== "running") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setState((s) => {
        const next = tick(s, t);
        if (next.status === "done" && s.status === "running") navigator.vibrate?.([300, 150, 300]);
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [state.status]);

  const left = state.status === "idle" ? preferred * 1000 : remainingMs(state, now);
  const selected = state.status === "idle" ? preferred : state.durationSec;
  const running = state.status === "running";

  return (
    <div
      role="timer"
      aria-label="Descanso"
      aria-live="off"
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background p-2 shadow-sm",
        state.status === "done" && "border-primary bg-primary/10",
      )}
    >
      <Timer className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="w-12 font-mono text-lg font-semibold tabular-nums" data-testid="rest-remaining">
        {state.status === "done" ? "¡Ya!" : formatRest(left)}
      </span>
      {state.status === "idle" || state.status === "done" ? (
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {REST_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                saveDuration(p);
                begin(p);
              }}
              aria-label={`Descanso de ${formatRest(p * 1000)}`}
              className={cn("h-8 shrink-0 rounded-full border px-2.5 text-xs tabular-nums", p === selected && "border-primary")}
            >
              {formatRest(p * 1000)}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 justify-end gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => {
            const t = Date.now();
            setState((s) => {
              const next = adjust(s, 30, t);
              if (next.status === "running") beep.schedule(remainingMs(next, t));
              return next;
            });
          }}>
            +30 s
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            aria-label={running ? "Pausar descanso" : "Reanudar descanso"}
            onClick={() => {
              const t = Date.now();
              setState((s) => {
                if (s.status === "running") {
                  beep.cancel();
                  return pause(s, t);
                }
                const next = resume(s, t);
                beep.schedule(remainingMs(next, t));
                return next;
              });
            }}
          >
            {running ? <Pause /> : <Play />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Terminar descanso"
            onClick={() => {
              beep.cancel();
              setState((s) => idle(s.durationSec));
            }}
          >
            <RotateCcw />
          </Button>
        </div>
      )}
    </div>
  );
}
