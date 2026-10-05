"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Stepper } from "@/components/form/stepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

export interface RecoveryValues {
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  hrvRmssdMs: number | null;
  restingHr: number | null;
  doms: number | null;
  fatigue: number | null;
  stress: number | null;
  mood: number | null;
  bodyWeightKg: number | null;
}

const scale = (labels: string[]) => labels.map((label, i) => ({ value: i + 1, label }));
const DOMS = Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }));

export function RecoveryForm({ initial }: { initial: RecoveryValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<RecoveryValues>) => setV((cur) => ({ ...cur, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api<{ readinessScore: number | null }>("/api/recovery", { body: v });
      toast.success(r.readinessScore != null ? `Readiness: ${Math.round(r.readinessScore)}` : "Guardado (faltan datos para el readiness)");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field label="Fecha" htmlFor="rdate">
        <Input id="rdate" type="date" value={v.date} onChange={(e) => set({ date: e.target.value })} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Horas de sueño">
          <Stepper label="Horas de sueño" value={v.sleepHours} onChange={(x) => set({ sleepHours: x })} step={0.25} decimals={2} max={24} suffix="h" />
        </Field>
        <Field label="VFC (rMSSD)" hint="Al despertar">
          <Stepper label="VFC rMSSD" value={v.hrvRmssdMs} onChange={(x) => set({ hrvRmssdMs: x })} max={300} suffix="ms" />
        </Field>
        <Field label="FC en reposo">
          <Stepper label="FC en reposo" value={v.restingHr} onChange={(x) => set({ restingHr: x })} max={150} suffix="ppm" />
        </Field>
        <Field label="Peso corporal">
          <Stepper label="Peso corporal" value={v.bodyWeightKg} onChange={(x) => set({ bodyWeightKg: x })} step={0.1} decimals={1} max={300} suffix="kg" />
        </Field>
      </div>
      <Field label="Calidad del sueño">
        <Chips label="Calidad del sueño" options={scale(["Mala", "Regular", "Normal", "Buena", "Excelente"])} value={v.sleepQuality} onChange={(x) => set({ sleepQuality: x })} allowDeselect />
      </Field>
      <Field label="DOMS (agujetas)" hint="0 = nada · 10 = máximo">
        <Chips label="DOMS" options={DOMS} value={v.doms} onChange={(x) => set({ doms: x })} allowDeselect />
      </Field>
      <Field label="Fatiga">
        <Chips label="Fatiga" options={scale(["Muy baja", "Baja", "Media", "Alta", "Muy alta"])} value={v.fatigue} onChange={(x) => set({ fatigue: x })} allowDeselect />
      </Field>
      <Field label="Estrés">
        <Chips label="Estrés" options={scale(["Muy bajo", "Bajo", "Medio", "Alto", "Muy alto"])} value={v.stress} onChange={(x) => set({ stress: x })} allowDeselect />
      </Field>
      <Field label="Ánimo">
        <Chips label="Ánimo" options={scale(["Muy bajo", "Bajo", "Normal", "Bueno", "Muy bueno"])} value={v.mood} onChange={(x) => set({ mood: x })} allowDeselect />
      </Field>
      <Button type="submit" size="lg" className="h-12 text-base" disabled={saving}>
        {saving ? "Guardando…" : "Guardar y calcular readiness"}
      </Button>
    </form>
  );
}
