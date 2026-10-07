"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/client-api";

type Values = { remindTomorrowHour: number | null; remindMondayCheck: boolean; remindWeigh: boolean };

/** Recordatorios push de «Mis reglas» (se guardan al cambiar). */
export function ReminderSettings({ initial }: { initial: Values }) {
  const [v, setV] = useState(initial);
  async function save(patch: Partial<Values>) {
    const next = { ...v, ...patch };
    setV(next);
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: patch });
      toast.success("Recordatorios guardados");
    } catch (err) {
      setV(v);
      toast.error((err as Error).message);
    }
  }
  return (
    <div className="grid gap-3 text-sm">
      <Field label="«Mañana toca…»" htmlFor="r-hour">
        <Select id="r-hour" value={v.remindTomorrowHour ?? ""} onChange={(e) => save({ remindTomorrowHour: e.target.value === "" ? null : Number(e.target.value) })}>
          <option value="">No avisar</option>
          {[17, 18, 19, 20, 21, 22].map((h) => (
            <option key={h} value={h}>
              A las {h}:00 del día anterior
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center justify-between gap-3">
        <span>Control rápido del lunes (8:00)</span>
        <Switch checked={v.remindMondayCheck} onCheckedChange={(c) => save({ remindMondayCheck: c })} aria-label="Recordar el control del lunes" />
      </label>
      <label className="flex items-center justify-between gap-3">
        <span>Pesarse lunes, miércoles y viernes (7:00)</span>
        <Switch checked={v.remindWeigh} onCheckedChange={(c) => save({ remindWeigh: c })} aria-label="Recordar pesarse" />
      </label>
      <p className="text-xs text-muted-foreground">Solo llegan a los dispositivos con las notificaciones activadas, y no si ya lo has apuntado.</p>
    </div>
  );
}
