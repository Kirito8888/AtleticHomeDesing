"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Stepper } from "@/components/form/stepper";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useZoneRefresh } from "@/components/zone-refresh";
import { api } from "@/lib/client-api";

type Goal = { kcal: number; proteinG: number; carbsG: number; fatG: number };

/** Marcar a mano el objetivo de un día (prevalece sobre las reglas) o volver al automático. Refresca solo la zona (0 RSC). */
export function DayTargetSheet({ date, goal, manual }: { date: string; goal: Goal | null; manual: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Goal>(goal ?? { kcal: 2000, proteinG: 100, carbsG: 250, fatG: 70 });
  const [busy, setBusy] = useState(false);
  const refresh = useZoneRefresh();

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = (k: keyof Goal, label: string, unit: string, step: number) => (
    <Field label={label}>
      <Stepper label={label} value={v[k]} step={step} max={10000} suffix={unit} onChange={(x) => x != null && setV((c) => ({ ...c, [k]: Math.round(x) }))} />
    </Field>
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o && goal) setV(goal);
        }}
      >
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="min-h-11" data-testid="day-target-edit">
            Ajustar objetivo de este día
          </Button>
        </SheetTrigger>
        <SheetContent className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Objetivo de este día</SheetTitle>
            <SheetDescription>Solo vale para esta fecha y prevalece sobre tus reglas.</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 px-4 pb-2">
            {field("kcal", "Energía", "kcal", 50)}
            {field("proteinG", "Proteína", "g", 5)}
            {field("carbsG", "Hidratos", "g", 10)}
            {field("fatG", "Grasa", "g", 5)}
          </div>
          <div className="px-4 pb-4">
            <Button type="button" className="min-h-11 w-full" disabled={busy} data-testid="day-target-save" onClick={() => run(() => api("/api/nutrition/day-target", { method: "PUT", body: { date, ...v } }), "Objetivo del día guardado")}>
              Guardar para este día
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      {manual ? (
        <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={busy} data-testid="day-target-reset" onClick={() => run(() => api(`/api/nutrition/day-target?date=${date}`, { method: "DELETE" }), "Vuelve el objetivo automático")}>
          Volver al automático
        </Button>
      ) : null}
    </div>
  );
}
