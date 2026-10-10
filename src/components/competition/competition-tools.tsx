"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { attemptSchedule, combinedWarmups, type ImportedEvent, parseCompetitionCsv, parseIcsEvents } from "@/lib/training/competition-tools";

const hhmm = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(Math.round(((m % 60) + 60) % 60)).padStart(2, "0")}`;
const toMin = (s: string) => (/^\d{2}:\d{2}$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);

/** 4 · Simulador de competición: cuándo te toca cada uno de los 6 intentos y cuánto descansas. */
export function AttemptSimulator({ start }: { start: string | null }) {
  const [athletes, setAthletes] = useState("12");
  const [position, setPosition] = useState("5");
  const [secs, setSecs] = useState("60");
  const [time, setTime] = useState(start ?? "");
  const n = Math.max(1, Number(athletes) || 1);
  const s = attemptSchedule({ athletes: n, position: Math.min(n, Math.max(1, Number(position) || 1)), secondsPerAttempt: Math.max(20, Number(secs) || 60) });
  const t0 = toMin(time);
  return (
    <div className="grid gap-3 text-sm">
      <div className="grid grid-cols-4 gap-2">
        <Field label="Atletas" htmlFor="sim-n">
          <Input id="sim-n" inputMode="numeric" className="w-full min-w-0" value={athletes} onChange={(e) => setAthletes(e.target.value)} />
        </Field>
        <Field label="Tu puesto" htmlFor="sim-p">
          <Input id="sim-p" inputMode="numeric" className="w-full min-w-0" value={position} onChange={(e) => setPosition(e.target.value)} />
        </Field>
        <Field label="s/intento" htmlFor="sim-s">
          <Input id="sim-s" inputMode="numeric" className="w-full min-w-0" value={secs} onChange={(e) => setSecs(e.target.value)} />
        </Field>
        <Field label="Empieza" htmlFor="sim-t">
          <Input id="sim-t" type="time" className="w-full min-w-0 px-1" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <ol className="grid gap-1" aria-label="Tus intentos">
        {s.attempts.map((a) => (
          <li key={a.round} className="flex justify-between rounded-md border px-2 py-1 tabular-nums">
            <span>
              Intento {a.round}
              {a.round === 4 ? " (mejora, si entras)" : ""}
            </span>
            <span>
              {t0 != null ? hhmm(t0 + a.atMin) : `min ${a.atMin}`}
              {a.restMin != null ? <span className="text-muted-foreground"> · descanso {a.restMin} min</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Concurso de unos {s.totalMin} min. En la mejora el orden depende de la clasificación: se supone un puesto intermedio. Entre intentos largos, mantén el calor (chaqueta, movilidad, 1-2 lanzamientos de imitación).</p>
    </div>
  );
}

/** 5 · Pruebas combinadas: calentamiento de cada prueba y qué hacer en los huecos. */
export function CombinedWarmups() {
  const [rows, setRows] = useState([
    { name: "", time: "", dur: "30" },
    { name: "", time: "", dur: "30" },
  ]);
  const [warm, setWarm] = useState("30");
  const events = rows.flatMap((r) => (r.name.trim() && toMin(r.time) != null ? [{ name: r.name.trim(), startMin: toMin(r.time)!, durationMin: Number(r.dur) || 30 }] : []));
  const plan = events.length ? combinedWarmups(events, Number(warm) || 30) : [];
  const set = (i: number, k: "name" | "time" | "dur", v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="grid gap-2 text-sm">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_5.5rem_4rem] gap-2">
          <Input aria-label={`Prueba ${i + 1}`} className="w-full min-w-0" placeholder="Prueba" value={r.name} onChange={(e) => set(i, "name", e.target.value)} />
          <Input aria-label={`Hora de la prueba ${i + 1}`} type="time" className="w-full min-w-0 px-1" value={r.time} onChange={(e) => set(i, "time", e.target.value)} />
          <Input aria-label={`Duración de la prueba ${i + 1}`} inputMode="numeric" className="w-full min-w-0" value={r.dur} onChange={(e) => set(i, "dur", e.target.value)} />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setRows([...rows, { name: "", time: "", dur: "30" }])}>
          + Prueba
        </Button>
        <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          Calentamiento
          <Input aria-label="Minutos de calentamiento" inputMode="numeric" className="h-8 w-14" value={warm} onChange={(e) => setWarm(e.target.value)} />
          min
        </label>
      </div>
      {plan.length ? (
        <ol className="grid gap-1" aria-label="Calentamientos de las pruebas">
          {plan.map((p) => (
            <li key={p.name + p.startMin} className="rounded-md border px-2 py-1">
              <span className="font-medium">{p.name}</span> a las {hhmm(p.startMin)} · calentar desde {hhmm(p.warmupStart)}
              <span className="block text-xs text-muted-foreground">{p.advice}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** 3 · Importar el calendario de la federación o del club (.ics o CSV): se lee aquí y se añaden las nuevas. */
export function CompetitionImport() {
  const router = useRouter();
  const [found, setFound] = useState<ImportedEvent[] | null>(null);
  async function read(file: File) {
    if (file.size > 2 * 1024 * 1024) return toast.error("Fichero demasiado grande (máx. 2 MB)");
    const text = await file.text();
    const ev = /BEGIN:VCALENDAR/.test(text) ? parseIcsEvents(text) : parseCompetitionCsv(text);
    if (!ev.length) toast.error("No se encontró ninguna competición (formato .ics o CSV «fecha;nombre;lugar»)");
    setFound(ev);
  }
  async function save() {
    try {
      const r = await api<{ added: number; skipped: number }>("/api/planning/competitions/import", { body: { events: found } });
      toast.success(`${r.added} competiciones añadidas${r.skipped ? ` (${r.skipped} ya estaban o eran antiguas)` : ""}`);
      setFound(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="grid gap-2 text-sm">
      <Input aria-label="Calendario de competiciones (.ics o CSV)" type="file" accept=".ics,.csv,text/calendar,text/csv" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
      {found?.length ? (
        <>
          <ul className="grid max-h-48 gap-0.5 overflow-auto text-xs" aria-label="Competiciones encontradas">
            {found.map((e, i) => (
              <li key={i}>
                {e.date} · {e.title}
                {e.location ? ` · ${e.location}` : ""}
              </li>
            ))}
          </ul>
          <Button type="button" onClick={save}>
            Añadir {found.length} al calendario
          </Button>
        </>
      ) : null}
    </div>
  );
}
