"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, Dumbbell, Target } from "lucide-react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { RestTimer } from "@/components/training/rest-timer";
import { type AutoregContext, blocksToSets, StrengthLogger, type ExerciseBlock, type ExerciseOption } from "@/components/training/strength-logger";
import { type FeelingValue, FeelingsPicker } from "@/components/training/feelings-picker";
import { FATIGUE_ZONES, type FatigueZone } from "@/lib/training/zone-fatigue";
import { initialTechnical, TechnicalLogger, technicalPayload, type TechnicalState } from "@/components/training/technical-logger";
import { initialTrack, TrackLogger, trackPayload, type TrackState } from "@/components/training/track-logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { enqueue, isNetworkError } from "@/lib/offline/outbox";
import { formatNum } from "@/lib/format";
import type { FormKind as Kind, SessionFormInitial } from "@/lib/training/form-initial";

const RPE = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

interface Created {
  id: string;
  tss: number | null;
  tssMethod: string | null;
  newPersonalRecords: Array<{ kind: string; value: number }>;
}

export function SessionForm({
  exercises,
  defaultDate,
  bodyWeightKg,
  initialType = "STRENGTH",
  initial,
  sessionId,
  autoreg,
}: {
  exercises: ExerciseOption[];
  defaultDate: string;
  bodyWeightKg: number | null;
  initialType?: Kind;
  /** Valores precargados (editar una sesión o repetir la última). */
  initial?: SessionFormInitial;
  /** Si se indica, se guarda con PATCH sobre esa sesión en vez de crear otra. */
  sessionId?: string;
  /** v1.6 · kg del día autorregulados (solo sugerencias; el plan no cambia). */
  autoreg?: AutoregContext;
}) {
  const router = useRouter();
  const [clientId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c${Date.now()}${Math.random().toString(36).slice(2, 10)}`));
  const [type, setType] = useState<Kind>(initial?.type ?? initialType);
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [minutes, setMinutes] = useState(initial?.minutes ?? "");
  const [rpe, setRpe] = useState<number | null>(initial?.rpe ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [feelings, setFeelings] = useState<FeelingValue[]>(initial?.feelings ?? []);
  const [zones, setZones] = useState<Partial<Record<FatigueZone, number>>>(initial?.zoneFatigue ?? {});
  const [planned, setPlanned] = useState(initial?.planned ?? false);
  const [mixed, setMixed] = useState(initial?.mixed ?? false);
  const [blocks, setBlocks] = useState<ExerciseBlock[]>(initial?.blocks ?? []);
  const [technical, setTechnical] = useState<TechnicalState>(initial?.technical ?? initialTechnical);
  const [track, setTrack] = useState<TrackState>(initial?.track ?? initialTrack);
  const [saving, setSaving] = useState(false);
  const [restSignal, setRestSignal] = useState(0);

  const [templateName, setTemplateName] = useState("");

  /** Cuerpo de la API a partir del formulario, o un mensaje si falta algo. */
  function buildBody(): Record<string, unknown> | string {
    const durationMin = Number(minutes.replace(",", "."));
    const common = {
      date,
      title: title || null,
      status: planned ? "PLANNED" : "COMPLETED",
      durationSec: minutes && !Number.isNaN(durationMin) ? Math.round(durationMin * 60) : null,
      sessionRpe: rpe,
      notes: notes || null,
      feelings: planned || !feelings.length ? null : feelings,
      zoneFatigue: planned || !Object.keys(zones).length ? null : zones,
    };
    if (mixed) {
      // Sesión mixta: cada parte con datos va en la misma sesión.
      const sets = blocksToSets(blocks);
      const t = trackPayload(track);
      const hasTrack = t.distanceM != null || t.movingTimeSec != null || t.intervals.length > 0;
      if (!sets.length && !technical.attempts.length && !hasTrack && !planned) return "Añade algo de fuerza, técnica o pista";
      return {
        ...common,
        type: "MIXED",
        strength: sets.length ? { bodyWeightKg, sets } : null,
        technical: technical.attempts.length ? technicalPayload(technical) : null,
        track: hasTrack ? t : null,
      };
    }
    if (type === "STRENGTH") {
      const sets = blocksToSets(blocks);
      if (!sets.length && !planned) return "Añade al menos una serie";
      return { ...common, type, discipline: "STRENGTH", strength: { bodyWeightKg, sets } };
    }
    if (type === "TECHNICAL") {
      if (!technical.attempts.length && !planned) return "Añade al menos un intento";
      return { ...common, type, discipline: technical.event.includes("JUMP") || technical.event === "POLE_VAULT" ? "JUMPS" : "THROWS", technical: technicalPayload(technical) };
    }
    return { ...common, type, track: trackPayload(track) };
  }

  async function saveTemplate() {
    const body = buildBody();
    if (typeof body === "string") return toast.error(body);
    if (!templateName.trim()) return toast.error("Ponle un nombre a la plantilla");
    try {
      const { date: _date, ...payload } = body;
      void _date;
      await api("/api/training/templates", { body: { name: templateName.trim(), payload } });
      toast.success(`Plantilla «${templateName.trim()}» guardada`);
      setTemplateName("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = buildBody();
    if (typeof body === "string") return toast.error(body);

    setSaving(true);
    // Cada sesión nueva lleva un id del dispositivo: si se reenvía (sin conexión), no se duplica
    const withId = sessionId ? body : { ...body, clientId };
    try {
      const s = sessionId
        ? await api<Created>(`/api/training/sessions/${sessionId}`, { method: "PATCH", body })
        : await api<Created>("/api/training/sessions", { body: withId });
      const prs = s.newPersonalRecords.length ? ` · ${s.newPersonalRecords.length} marca(s) personal(es) 🎉` : "";
      toast.success(planned ? "Sesión planificada" : `Guardada${s.tss != null ? ` · ${formatNum(s.tss)} TSS` : ""}${prs}`);
      router.push(`/training/${s.id}`);
      router.refresh();
    } catch (err) {
      if (!sessionId && isNetworkError(err)) {
        try {
          await enqueue({ id: clientId, url: "/api/training/sessions", body: withId, label: title || "Sesión" });
          toast.success("Sin conexión: la sesión queda guardada en el móvil y se enviará sola al volver la cobertura");
          // Sin red no se puede cargar otra página: se queda aquí; el aviso de arriba cuenta lo pendiente
          setSaving(false);
          return;
        } catch {
          // sin IndexedDB: se informa del error normal
        }
      }
      toast.error((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Tabs value={type} onValueChange={(v) => setType(v as Kind)}>
        <TabsList>
          <TabsTrigger value="STRENGTH">
            <Dumbbell /> Fuerza
          </TabsTrigger>
          <TabsTrigger value="TECHNICAL">
            <Target /> Técnica
          </TabsTrigger>
          <TabsTrigger value="TRACK">
            <Activity /> Pista
          </TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha" htmlFor="date">
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Duración (min)" htmlFor="minutes">
            <Input id="minutes" inputMode="numeric" placeholder="75" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <Field label="Título (opcional)" htmlFor="title">
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="p.ej. Fuerza máxima tren inferior" />
            </Field>
          </div>
        </div>

        <TabsContent value="STRENGTH">
          <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-20 mb-3 md:top-2">
            <RestTimer autoStart={restSignal} />
          </div>
          <StrengthLogger
            exercises={exercises}
            blocks={blocks}
            onChange={setBlocks}
            bodyWeightKg={bodyWeightKg}
            onSetCompleted={() => setRestSignal((n) => n + 1)}
            autoreg={autoreg}
          />
        </TabsContent>
        <TabsContent value="TECHNICAL">
          <TechnicalLogger value={technical} onChange={setTechnical} />
        </TabsContent>
        <TabsContent value="TRACK">
          <TrackLogger value={track} onChange={setTrack} />
        </TabsContent>
      </Tabs>

      <Field label="RPE de la sesión" hint="Esfuerzo global (Foster, 1–10). Con la duración, es el método de carga más fiable para fuerza y técnica.">
        <Chips label="RPE de la sesión" options={RPE} value={rpe} onChange={setRpe} allowDeselect />
      </Field>

      {!planned ? (
        <Field label="Sensaciones al terminar" hint="¿Alguna molestia? Toca la zona y marca el dolor. Avisa en Inicio si hace falta.">
          <FeelingsPicker value={feelings} onChange={setFeelings} />
        </Field>
      ) : null}
      {!planned ? (
        <Field label="Fatiga por zona (opcional)" hint="0 = nada · 10 = muy cargada. Entra en el semáforo de Inicio.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(FATIGUE_ZONES) as FatigueZone[]).map((z) => (
              <label key={z} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm">
                {FATIGUE_ZONES[z]}
                <select
                  aria-label={`Fatiga en ${FATIGUE_ZONES[z].toLowerCase()}`}
                  className="h-8 rounded-md border bg-background px-1 tabular-nums"
                  value={zones[z] ?? ""}
                  onChange={(e) => {
                    const { [z]: _drop, ...rest } = zones;
                    void _drop;
                    setZones(e.target.value === "" ? rest : { ...rest, [z]: Number(e.target.value) });
                  }}
                >
                  <option value="">—</option>
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </Field>
      ) : null}

      <Field label="Notas" htmlFor="notes">
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Sensaciones, molestias, condiciones…" />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={mixed} onChange={(e) => setMixed(e.target.checked)} />
        Sesión mixta: guardar a la vez fuerza, técnica y pista (rellena cada pestaña)
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={planned} onChange={(e) => setPlanned(e.target.checked)} />
        Guardar como planificada (no suma carga)
      </label>

      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Guardar como plantilla</summary>
        <div className="mt-3 flex gap-2">
          <Input
            aria-label="Nombre de la plantilla"
            placeholder="p.ej. Fuerza A"
            value={templateName}
            maxLength={80}
            onChange={(e) => setTemplateName(e.target.value)}
          />
          <Button type="button" variant="outline" onClick={saveTemplate}>
            Guardar plantilla
          </Button>
        </div>
      </details>

      <div className="sticky bottom-20 z-10 md:bottom-4">
        <Button type="submit" size="lg" className="h-12 w-full text-base shadow-lg" disabled={saving}>
          {saving ? "Guardando…" : sessionId ? "Guardar cambios" : "Guardar sesión"}
        </Button>
      </div>
    </form>
  );
}
