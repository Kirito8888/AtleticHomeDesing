"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Stepper } from "@/components/form/stepper";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import type { Prefs } from "@/lib/rules/prefs";

type RuleKeys =
  | "kgStep"
  | "rmTestThreshold"
  | "squeezeMax"
  | "heelMax"
  | "feelingPainMax"
  | "weightGainWeekKg"
  | "weightBlockKg"
  | "weightMinKg"
  | "bodyFatBlockPts"
  | "throwCapRatio"
  | "throwMinHours"
  | "hrvDropPct"
  | "videoMinPct"
  | "monotonyMax"
  | "sleepTargetH"
  | "sleepDebtMaxH"
  | "vbtMvt"
  | "vbtLossMax"
  | "autoregMaxPct"
  | "taperDays"
  | "taperPct"
  | "lightReadinessAmber"
  | "lightReadinessRed"
  | "lightHooperAmber"
  | "lightHooperRed"
  | "lightPainRed"
  | "lightZoneAmber";
export type RuleValues = Pick<Prefs, RuleKeys>;

const KG_STEPS = [0.5, 1, 1.25, 2.5] as const;

/** «Mis reglas»: los umbrales de los avisos y del cálculo de kg (valores por defecto genéricos). */
export function RulesForm({ initial }: { initial: RuleValues }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<RuleValues>) => setV((cur) => ({ ...cur, ...patch }));
  const num = (k: Exclude<RuleKeys, "kgStep" | "weightMinKg">, label: string, o: { step?: number; decimals?: number; min?: number; max: number; suffix?: string }, hint?: string) => (
    <Field label={label} hint={hint}>
      <Stepper label={label} value={v[k]} onChange={(x) => x != null && set({ [k]: x })} {...o} />
    </Field>
  );

  async function save() {
    setSaving(true);
    try {
      // Un peso mínimo a medio escribir o fuera de rango = sin aviso.
      const weightMinKg = v.weightMinKg != null && v.weightMinKg >= 30 ? v.weightMinKg : null;
      await api("/api/settings/prefs", { method: "PATCH", body: { ...v, weightMinKg } });
      set({ weightMinKg });
      toast.success("Reglas guardadas");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Field label="Redondeo de los kg (%RM)">
        <Chips
          label="Redondeo"
          options={KG_STEPS.map((s) => ({ value: s, label: `${String(s).replace(".", ",")} kg` }))}
          value={v.kgStep}
          onChange={(x) => x != null && set({ kgStep: x })}
        />
      </Field>
      <Field label="Serie de test: cambio mínimo para actualizar la RM">
        <Stepper label="Cambio mínimo de RM" value={Math.round(v.rmTestThreshold * 100)} onChange={(x) => x != null && set({ rmTestThreshold: x / 100 })} max={50} suffix="%" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {num("squeezeMax", "Squeeze: avisar por encima de", { max: 10, suffix: "/10" })}
        {num("heelMax", "Talón: avisar por encima de", { max: 10, suffix: "/10" })}
        {num("feelingPainMax", "Molestias al terminar: avisar por encima de", { max: 10, suffix: "/10" })}
        {num("weightGainWeekKg", "Peso: subida semanal", { step: 0.1, decimals: 1, max: 5, suffix: "kg" }, "Dos semanas seguidas")}
        {num("weightBlockKg", "Peso: cambio en un mes", { step: 0.5, decimals: 1, max: 10, suffix: "kg" })}
        <Field label="Peso mínimo" hint="Vacío = sin aviso">
          <Stepper label="Peso mínimo" value={v.weightMinKg} onChange={(x) => set({ weightMinKg: x })} step={0.5} decimals={1} max={250} suffix="kg" />
        </Field>
        {num("bodyFatBlockPts", "% de grasa: cambio en un mes", { step: 0.5, decimals: 1, max: 20, suffix: "pts" })}
        {num("throwCapRatio", "Lanzamientos: tope", { step: 0.1, decimals: 1, min: 1, max: 3, suffix: "×" }, "× media de 4 semanas")}
        {num("throwMinHours", "Horas entre sesiones de lanzamiento", { step: 6, max: 168, suffix: "h" })}
        {num("hrvDropPct", "VFC: caída que cuenta", { step: 0.5, decimals: 1, max: 30, suffix: "%" })}
        {num("videoMinPct", "Vídeo: mínimo correcto", { step: 5, max: 100, suffix: "%" })}
        {num("monotonyMax", "Monotonía (Foster): avisar por encima de", { step: 0.1, decimals: 1, min: 1, max: 5 })}
        {num("sleepTargetH", "Sueño: horas objetivo", { step: 0.5, decimals: 1, min: 5, max: 12, suffix: "h" })}
        {num("vbtMvt", "VBT: velocidad mínima (RM)", { step: 0.05, decimals: 2, min: 0.1, max: 1, suffix: "m/s" })}
        {num("vbtLossMax", "VBT: pérdida de velocidad para avisar", { step: 1, min: 5, max: 60, suffix: "%" })}
        {num("autoregMaxPct", "Kg del día: como mucho ± respecto al plan", { step: 1, min: 0, max: 20, suffix: "%" })}
        {num("taperDays", "Afinamiento: días antes de competir", { step: 1, min: 2, max: 21, suffix: "d" })}
        {num("taperPct", "Afinamiento: series que se recortan", { step: 5, min: 10, max: 60, suffix: "%" })}
        {num("lightReadinessAmber", "Semáforo: readiness ámbar por debajo de", { step: 5, min: 0, max: 100 })}
        {num("lightReadinessRed", "Semáforo: readiness rojo por debajo de", { step: 5, min: 0, max: 100 })}
        {num("lightHooperAmber", "Semáforo: índice Hooper ámbar desde", { step: 1, min: 4, max: 20 })}
        {num("lightHooperRed", "Semáforo: índice Hooper rojo desde", { step: 1, min: 4, max: 20 })}
        {num("lightPainRed", "Semáforo: dolor rojo desde", { step: 1, min: 1, max: 10, suffix: "/10" })}
        {num("lightZoneAmber", "Semáforo: fatiga de una zona ámbar desde", { step: 1, min: 1, max: 10, suffix: "/10" })}
        {num("sleepDebtMaxH", "Deuda de sueño (7 días): avisar desde", { step: 0.5, decimals: 1, min: 1, max: 30, suffix: "h" })}
      </div>
      <Button type="button" onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar mis reglas"}
      </Button>
    </div>
  );
}
