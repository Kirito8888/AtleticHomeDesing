"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field, MultiChips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EQUIPMENT, LOCATIONS } from "@/lib/ai-plan/options";
import { api } from "@/lib/client-api";

export type SwappableRow = { block: number; row: number; exercise: string; alternatives: string[] };

const locOpts = (Object.entries(LOCATIONS) as Array<[keyof typeof LOCATIONS, string]>).map(([value, label]) => ({ value, label }));
const eqOpts = (Object.entries(EQUIPMENT) as Array<[keyof typeof EQUIPMENT, string]>)
  .filter(([k]) => !["peso_corporal", "maquinas", "pista", "piscina"].includes(k))
  .map(([value, label]) => ({ value, label }));

/**
 * Ajustes del día sin escribir: versión suave, otro sitio o material y cambiar
 * un ejercicio por una de sus alternativas.
 */
export function DayActions({ dayId, mode, hasLight, swappable, suggestion }: { dayId: string; mode: string | null; hasLight: boolean; swappable: SwappableRow[]; suggestion?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState<keyof typeof LOCATIONS | null>(null);
  const [equipment, setEquipment] = useState<Array<keyof typeof EQUIPMENT>>([]);

  async function post(body: object, ok: (r: Record<string, number>) => string) {
    setBusy(true);
    try {
      const r = await api<Record<string, number>>(`/api/planning/plan/day/${dayId}`, { body });
      toast.success(ok(r));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 grid gap-3">
      {hasLight ? (
        <div className={mode === "LIGHT" ? "rounded-md border border-primary/40 bg-primary/5 p-3 text-sm" : "rounded-md border p-3 text-sm"}>
          {suggestion && mode !== "LIGHT" ? <p className="mb-2 font-medium">💡 {suggestion}: te propongo la versión suave.</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{mode === "LIGHT" ? "Hoy usas la versión suave." : "¿Hoy vas justo de fuerzas o de tiempo?"}</span>
            <Button
              type="button"
              size="sm"
              variant={mode === "LIGHT" ? "outline" : "default"}
              disabled={busy}
              onClick={() => void post({ action: "mode", mode: mode === "LIGHT" ? null : "LIGHT" }, () => (mode === "LIGHT" ? "Vuelves a la versión normal" : "Versión suave para hoy"))}
            >
              {mode === "LIGHT" ? "Volver a la normal" : "Usar versión suave"}
            </Button>
          </div>
        </div>
      ) : null}

      {swappable.length ? (
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Ajustar este día</summary>
          <div className="mt-3 grid gap-4">
            <div className="grid gap-2">
              <Field label="Hoy entreno en">
                <Chips label="Sitio de hoy" options={locOpts} value={location} onChange={setLocation} />
              </Field>
              <Field label="Y tengo" hint="El peso corporal siempre cuenta.">
                <MultiChips label="Material de hoy" options={eqOpts} value={equipment} onChange={setEquipment} />
              </Field>
              <Button
                type="button"
                size="sm"
                className="w-fit"
                disabled={busy || !location}
                onClick={() =>
                  void post({ action: "swap", location, equipment }, (r) =>
                    r.pending ? `${r.swapped} cambiados; ${r.pending} sin alternativa (hazlos con lo que tengas o sáltalos)` : r.swapped ? `${r.swapped} ejercicios cambiados` : "Todo se puede hacer ahí: sin cambios",
                  )
                }
              >
                Adaptar los ejercicios
              </Button>
            </div>
            <div className="grid gap-2" aria-label="Cambiar un ejercicio">
              <span className="font-medium">Cambiar un ejercicio</span>
              {swappable.map((s) => (
                <label key={`${s.block}-${s.row}`} className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{s.exercise}</span>
                  <Select
                    aria-label={`Alternativa a ${s.exercise}`}
                    value=""
                    disabled={busy}
                    onChange={(e) => {
                      if (e.target.value === "") return;
                      void post({ action: "alternative", block: s.block, row: s.row, alt: Number(e.target.value) }, () => "Ejercicio cambiado");
                    }}
                  >
                    <option value="">Elegir alternativa…</option>
                    {s.alternatives.map((a, i) => (
                      <option key={a} value={i}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
