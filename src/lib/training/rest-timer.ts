// Lógica pura del temporizador de descanso (sin React ni navegador) para poder
// probarla con un reloj simulado. Se guarda la hora de fin, no un contador: así
// no se desajusta si el móvil ralentiza los intervalos con la pantalla apagada.

export type RestTimer =
  | { status: "idle"; durationSec: number }
  | { status: "running"; durationSec: number; endsAt: number }
  | { status: "paused"; durationSec: number; remainingMs: number }
  | { status: "done"; durationSec: number };

export const REST_PRESETS = [60, 90, 120, 180, 240] as const;

export const idle = (durationSec: number): RestTimer => ({ status: "idle", durationSec });

export function start(t: RestTimer, now: number, durationSec = t.durationSec): RestTimer {
  return { status: "running", durationSec, endsAt: now + durationSec * 1000 };
}

export function pause(t: RestTimer, now: number): RestTimer {
  return t.status === "running" ? { status: "paused", durationSec: t.durationSec, remainingMs: Math.max(0, t.endsAt - now) } : t;
}

export function resume(t: RestTimer, now: number): RestTimer {
  return t.status === "paused" ? { status: "running", durationSec: t.durationSec, endsAt: now + t.remainingMs } : t;
}

/** Suma (o resta) segundos al descanso en curso: "+30 s" sin reiniciar. */
export function adjust(t: RestTimer, deltaSec: number, now: number): RestTimer {
  if (t.status === "running") return { ...t, endsAt: Math.max(now, t.endsAt + deltaSec * 1000) };
  if (t.status === "paused") return { ...t, remainingMs: Math.max(0, t.remainingMs + deltaSec * 1000) };
  return t;
}

export function remainingMs(t: RestTimer, now: number): number {
  switch (t.status) {
    case "running":
      return Math.max(0, t.endsAt - now);
    case "paused":
      return t.remainingMs;
    case "idle":
      return t.durationSec * 1000;
    case "done":
      return 0;
  }
}

/** Avanza el estado: un temporizador en marcha que llega a 0 pasa a "done". */
export function tick(t: RestTimer, now: number): RestTimer {
  return t.status === "running" && now >= t.endsAt ? { status: "done", durationSec: t.durationSec } : t;
}

/** 95000 → "1:35" */
export function formatRest(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
