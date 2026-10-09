"use client";

import { useEffect, useState } from "react";

import { Chips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { BREATHING, type BreathingKey, breathingPhase } from "@/lib/recovery/wellbeing";

const KEYS = Object.keys(BREATHING) as BreathingKey[];

/** v1.7 · Respiración guiada: un círculo que crece al inhalar y se encoge al exhalar. */
export function Breathing() {
  const [key, setKey] = useState<BreathingKey>("caja");
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (start == null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [start]);
  const t = start == null ? 0 : Math.max(0, (now - start) / 1000);
  const ph = breathingPhase(key, t);
  // Al inhalar crece, al exhalar se encoge; al mantener se queda como estaba.
  const scale = start == null ? 0.6 : ph.name === "Inhala" ? 0.5 + 0.5 * ph.progress : ph.name === "Exhala" ? 1 - 0.5 * ph.progress : ph.prev === "Inhala" ? 1 : 0.5;

  return (
    <div className="grid gap-3 text-sm">
      <Chips label="Técnica" options={KEYS.map((k) => ({ value: k, label: BREATHING[k].label }))} value={key} onChange={(v) => v && (setKey(v), setStart(null))} />
      <div className="grid place-items-center py-4">
        <div className="grid size-40 place-items-center rounded-full bg-primary/15 transition-transform duration-300 ease-linear motion-reduce:transition-none" style={{ transform: `scale(${scale})` }} aria-hidden="true" />
        <p className="mt-[-6.5rem] mb-[4.5rem] text-center text-base font-semibold" aria-live="polite">
          {start == null ? "Lista/o" : `${ph.name} · ${ph.remaining}`}
        </p>
      </div>
      <p className="text-center text-xs text-muted-foreground">{start == null ? BREATHING[key].phases.map(([n, s]) => `${n} ${String(s).replace(".", ",")} s`).join(" · ") : `Ciclos: ${ph.cycles}`}</p>
      <Button
        type="button"
        variant={start == null ? "default" : "outline"}
        onClick={() => {
          const n = Date.now();
          setNow(n);
          setStart(start == null ? n : null);
        }}
      >
        {start == null ? "Empezar" : "Parar"}
      </Button>
    </div>
  );
}
