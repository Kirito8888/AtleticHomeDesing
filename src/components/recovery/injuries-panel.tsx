"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import { BODY_AREA_LABEL, type BodyAreaName, injuryName } from "@/lib/recovery/injury-rules";

export interface InjuryView {
  id: string;
  area: BodyAreaName;
  side: "LEFT" | "RIGHT" | "BOTH" | null;
  pain: number;
  limitsTraining: boolean;
  startedOn: string;
  resolvedOn: string | null;
  notes: string | null;
}

const PAIN = Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }));

export function InjuriesPanel({ injuries, today }: { injuries: InjuryView[]; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pain, setPain] = useState<number | null>(3);
  const active = injuries.filter((i) => !i.resolvedOn);
  const past = injuries.filter((i) => i.resolvedOn).slice(0, 5);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4">
        <CardTitle className="text-sm">Molestias y lesiones</CardTitle>
        {!adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            Añadir
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {adding ? (
          <form
            className="grid gap-3 rounded-md border p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const ok = await run(
                () =>
                  api("/api/recovery/injuries", {
                    body: {
                      area: f.get("area"),
                      side: f.get("side") || null,
                      pain: pain ?? 0,
                      limitsTraining: f.get("limits") === "on",
                      startedOn: f.get("startedOn"),
                      notes: f.get("notes") || null,
                    },
                  }),
                "Molestia registrada",
              );
              if (ok) setAdding(false);
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <Field label="Zona" htmlFor="inj-area">
                <Select id="inj-area" name="area" defaultValue="KNEE">
                  {Object.entries(BODY_AREA_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Lado" htmlFor="inj-side">
                <Select id="inj-side" name="side" defaultValue="">
                  <option value="">—</option>
                  <option value="LEFT">Izquierda</option>
                  <option value="RIGHT">Derecha</option>
                  <option value="BOTH">Ambos</option>
                </Select>
              </Field>
            </div>
            <Field label="Dolor (0–10)">
              <Chips label="Dolor" options={PAIN} value={pain} onChange={setPain} />
            </Field>
            <Field label="Desde" htmlFor="inj-start">
              <Input id="inj-start" name="startedOn" type="date" defaultValue={today} max={today} required />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="limits" className="size-4" /> Me limita al entrenar
            </label>
            <Field label="Notas" htmlFor="inj-notes">
              <Textarea id="inj-notes" name="notes" placeholder="Cómo empezó, qué movimientos duelen…" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Guardar
              </Button>
            </div>
          </form>
        ) : null}

        {active.length ? (
          <ul className="grid gap-2" aria-label="Molestias activas">
            {active.map((i) => (
              <li key={i.id} className="grid gap-1 rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{injuryName(i)}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">dolor {i.pain}/10</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Desde el {formatDate(i.startedOn, { day: "numeric", month: "short" })}
                  {i.limitsTraining ? " · limita el entreno" : ""}
                  {i.notes ? ` · ${i.notes}` : ""}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => run(() => api(`/api/recovery/injuries/${i.id}`, { method: "PATCH", body: { resolvedOn: today } }), "Marcada como recuperada")}
                >
                  Ya estoy recuperado/a
                </Button>
              </li>
            ))}
          </ul>
        ) : !adding ? (
          <p className="text-sm text-muted-foreground">Sin molestias activas.</p>
        ) : null}

        {past.length ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Historial</summary>
            <ul className="mt-2 grid gap-1">
              {past.map((i) => (
                <li key={i.id}>
                  {injuryName(i)} · {formatDate(i.startedOn, { day: "numeric", month: "short" })} → {formatDate(i.resolvedOn!, { day: "numeric", month: "short" })}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <p className="text-xs text-muted-foreground">Dato de salud privado: no se envía a la IA y tu entrenador solo lo ve si le das el permiso de recuperación.</p>
      </CardContent>
    </Card>
  );
}
