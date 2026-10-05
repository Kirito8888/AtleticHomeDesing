"use client";

import { Copy, Trash2 } from "lucide-react";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDuration, formatPace, parseDuration } from "@/lib/format";

export interface IntervalRow {
  distanceM: string;
  time: string;
  recovery: string;
}

export interface TrackState {
  modality: string;
  surface: string;
  distanceKm: string;
  time: string;
  hrAvg: string;
  hrMax: string;
  intervals: IntervalRow[];
}

export const initialTrack = (): TrackState => ({
  modality: "RUN",
  surface: "TRACK",
  distanceKm: "",
  time: "",
  hrAvg: "",
  hrMax: "",
  intervals: [],
});

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || Number.isNaN(n) ? null : n;
};

export function trackPayload(t: TrackState) {
  const dist = num(t.distanceKm);
  const time = parseDuration(t.time);
  return {
    modality: t.modality,
    surface: t.surface || null,
    distanceM: dist != null ? Math.round(dist * 1000) : null,
    movingTimeSec: time != null ? Math.round(time) : null,
    hrAvg: num(t.hrAvg),
    hrMax: num(t.hrMax),
    intervals: t.intervals
      .filter((iv) => iv.distanceM || iv.time)
      .map((iv) => ({
        distanceM: num(iv.distanceM),
        timeSec: parseDuration(iv.time),
        recoverySec: parseDuration(iv.recovery),
      })),
  };
}

export function TrackLogger({ value, onChange }: { value: TrackState; onChange: (t: TrackState) => void }) {
  const set = (patch: Partial<TrackState>) => onChange({ ...value, ...patch });
  const setIv = (i: number, patch: Partial<IntervalRow>) =>
    set({ intervals: value.intervals.map((iv, j) => (j === i ? { ...iv, ...patch } : iv)) });
  const isSwim = value.modality === "SWIM";
  const dist = num(value.distanceKm);
  const time = parseDuration(value.time);
  const pace = dist && time ? (isSwim ? time / ((dist * 1000) / 100) : time / dist) : null;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Modalidad" htmlFor="modality">
          <Select id="modality" value={value.modality} onChange={(e) => set({ modality: e.target.value, surface: e.target.value === "SWIM" ? "POOL_25" : "TRACK" })}>
            <option value="RUN">Carrera</option>
            <option value="SPRINT">Velocidad</option>
            <option value="HURDLES">Vallas</option>
            <option value="SWIM">Natación</option>
            <option value="CYCLE">Ciclismo</option>
            <option value="ROW">Remo</option>
            <option value="WALK">Marcha</option>
            <option value="OTHER">Otro</option>
          </Select>
        </Field>
        <Field label="Superficie" htmlFor="surface">
          <Select id="surface" value={value.surface} onChange={(e) => set({ surface: e.target.value })}>
            <option value="TRACK">Pista</option>
            <option value="ROAD">Asfalto</option>
            <option value="TRAIL">Montaña</option>
            <option value="TREADMILL">Cinta</option>
            <option value="POOL_25">Piscina 25 m</option>
            <option value="POOL_50">Piscina 50 m</option>
            <option value="OPEN_WATER">Aguas abiertas</option>
            <option value="OTHER">Otra</option>
          </Select>
        </Field>
        <Field label="Distancia (km)" htmlFor="dist">
          <Input id="dist" inputMode="decimal" placeholder="10,5" value={value.distanceKm} onChange={(e) => set({ distanceKm: e.target.value })} />
        </Field>
        <Field label="Tiempo en movimiento" htmlFor="time" hint="h:mm:ss o mm:ss">
          <Input id="time" inputMode="numeric" placeholder="45:30" value={value.time} onChange={(e) => set({ time: e.target.value })} />
        </Field>
        <Field label="FC media" htmlFor="hravg">
          <Input id="hravg" inputMode="numeric" placeholder="ppm" value={value.hrAvg} onChange={(e) => set({ hrAvg: e.target.value })} />
        </Field>
        <Field label="FC máxima" htmlFor="hrmax">
          <Input id="hrmax" inputMode="numeric" placeholder="ppm" value={value.hrMax} onChange={(e) => set({ hrMax: e.target.value })} />
        </Field>
      </div>
      {pace ? (
        <p className="text-sm text-muted-foreground">
          Ritmo medio: <span className="font-semibold text-foreground tabular-nums">{formatPace(pace, isSwim ? "/100 m" : "/km")}</span>
          {time ? <> · {formatDuration(time)}</> : null}
        </p>
      ) : null}

      <div className="grid gap-2">
        <h3 className="font-semibold">Series ({value.intervals.length})</h3>
        {value.intervals.length ? (
          <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr_2rem] items-center gap-1.5 text-xs text-muted-foreground">
            <span />
            <span>Metros</span>
            <span>Tiempo</span>
            <span>Recup.</span>
            <span />
          </div>
        ) : null}
        {value.intervals.map((iv, i) => (
          <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1fr_2rem] items-center gap-1.5">
            <span className="text-sm text-muted-foreground tabular-nums">{i + 1}</span>
            <Input aria-label={`Distancia serie ${i + 1}`} inputMode="numeric" value={iv.distanceM} onChange={(e) => setIv(i, { distanceM: e.target.value })} placeholder="300" />
            <Input aria-label={`Tiempo serie ${i + 1}`} inputMode="decimal" value={iv.time} onChange={(e) => setIv(i, { time: e.target.value })} placeholder="42,3" />
            <Input aria-label={`Recuperación serie ${i + 1}`} inputMode="numeric" value={iv.recovery} onChange={(e) => setIv(i, { recovery: e.target.value })} placeholder="3:00" />
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={`Borrar serie ${i + 1}`} onClick={() => set({ intervals: value.intervals.filter((_, j) => j !== i) })}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const last = value.intervals.at(-1);
            set({ intervals: [...value.intervals, last ? { ...last, time: "" } : { distanceM: "", time: "", recovery: "" }] });
          }}
        >
          <Copy /> {value.intervals.length ? "Repetir serie" : "Añadir serie"}
        </Button>
      </div>
    </div>
  );
}
