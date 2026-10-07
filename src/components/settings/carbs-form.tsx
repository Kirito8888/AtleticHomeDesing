"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Stepper } from "@/components/form/stepper";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

type Values = { carbsThrowDayG: number | null; carbsHeavyDayG: number | null; carbsRestDayG: number | null };

/** Hidratos según el día del plan (vacío = usar el objetivo general). */
export function CarbsByDayForm({ initial }: { initial: Values }) {
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const field = (k: keyof Values, label: string) => (
    <Field label={label} hint="Vacío = objetivo general">
      <Stepper label={label} value={v[k]} onChange={(x) => setV((cur) => ({ ...cur, [k]: x }))} step={10} max={1500} suffix="g" />
    </Field>
  );
  async function save() {
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x == null || x <= 0 ? null : Math.round(x)]));
      await api("/api/settings/prefs", { method: "PATCH", body });
      toast.success("Hidratos por día guardados");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Con tu plantilla metabólica: el objetivo de hidratos cambia si ese día toca jabalina, gimnasio o descanso.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {field("carbsThrowDayG", "Día de lanzamientos")}
        {field("carbsHeavyDayG", "Día de gimnasio")}
        {field("carbsRestDayG", "Día sin entreno")}
      </div>
      <Button type="button" variant="outline" onClick={save} disabled={saving}>
        Guardar hidratos por día
      </Button>
    </div>
  );
}
