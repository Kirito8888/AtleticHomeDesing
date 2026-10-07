"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { hhmm, warmupSchedule } from "@/lib/planning/competition";
import { cn } from "@/lib/utils";

type Block = { name: string; minutes: number };
const nowSec = () => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return get("hour") * 3600 + get("minute") * 60 + get("second");
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Calentamiento de competición contando hacia atrás hasta la hora de la prueba. */
export function WarmupTimer({ blocks: initial }: { blocks: Block[] }) {
  const [blocks, setBlocks] = useState(initial);
  const [time, setTime] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!time) return;
    const id = setInterval(() => setNow(nowSec()), 1000);
    return () => clearInterval(id);
  }, [time]);

  const [h, m] = time.split(":").map(Number);
  const st = time && now != null ? warmupSchedule(blocks, h * 60 + m, now) : null;

  useEffect(() => {
    const cur = st?.phase === "during" ? st.current : null;
    if (cur != null && last.current !== cur) {
      if (last.current != null && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
      last.current = cur;
    }
  }, [st?.phase, st?.current]);

  async function save(next: Block[]) {
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: { warmupBlocks: next } });
      setBlocks(next);
      toast.success("Calentamiento guardado");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-3 text-sm">
      <Field label="Hora de la prueba" htmlFor="ev-time">
        <Input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>
      {st ? (
        <div role="timer" aria-live="polite" className="rounded-md border p-3">
          {st.phase === "before" ? (
            <p>
              Empieza a calentar a las <span className="font-semibold tabular-nums">{hhmm(st.startMin)}</span> (en {mmss(st.remainingSec!)})
            </p>
          ) : st.phase === "during" ? (
            <p className="text-base">
              <span className="font-semibold">{st.blocks[st.current!].name}</span> · quedan <span className="font-semibold tabular-nums">{mmss(st.remainingSec!)}</span>
            </p>
          ) : (
            <p className="font-semibold">¡A competir!</p>
          )}
        </div>
      ) : null}
      <ol className="grid gap-1" aria-label="Bloques del calentamiento">
        {(st?.blocks ?? blocks.map((b) => ({ name: b.name, from: 0, to: 0 }))).map((b, i) => (
          <li key={i} className={cn("flex justify-between rounded-md border px-3 py-1.5", st?.current === i && "border-primary bg-primary/5 font-medium")}>
            <span>{b.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{st ? `${hhmm(b.from)}–${hhmm(b.to)}` : `${blocks[i].minutes} min`}</span>
          </li>
        ))}
      </ol>
      {editing ? (
        <div className="grid gap-2">
          {blocks.map((b, i) => (
            <div key={i} className="flex gap-2">
              <Input aria-label={`Bloque ${i + 1}`} value={b.name} maxLength={40} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input
                aria-label={`Minutos del bloque ${i + 1}`}
                className="w-20"
                inputMode="numeric"
                value={b.minutes}
                onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, minutes: Math.max(1, Math.min(60, Number(e.target.value) || 1)) } : x)))}
              />
              <Button type="button" variant="ghost" size="sm" aria-label={`Quitar bloque ${i + 1}`} disabled={blocks.length <= 1} onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={blocks.length >= 12} onClick={() => setBlocks([...blocks, { name: "Bloque", minutes: 5 }])}>
              + Bloque
            </Button>
            <Button type="button" size="sm" onClick={() => void save(blocks.filter((b) => b.name.trim())).then(() => setEditing(false))}>
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setEditing(true)}>
          Editar los bloques
        </Button>
      )}
    </div>
  );
}
