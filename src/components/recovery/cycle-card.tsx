"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field, MultiChips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { CYCLE_PARTS, type CycleSettings, PART_LABEL, SYMPTOMS } from "@/lib/health/cycle";

type Opt<T extends string> = Array<{ value: T; label: string }>;
const opts = <T extends string>(o: Record<T, string>): Opt<T> => (Object.entries(o) as Array<[T, string]>).map(([value, label]) => ({ value, label }));

/**
 * «Mi ciclo»: registro de hoy con chips, ajustes y borrado. Los datos van
 * cifrados, no se envían a la IA y el entrenador no los ve.
 */
export function CycleCard({
  today,
  settings,
  todayLog,
  phase,
  suggestion,
}: {
  today: string;
  settings: CycleSettings | null;
  todayLog: { period: boolean; symptoms: Array<keyof typeof SYMPTOMS> } | null;
  phase: { day: number | null; part: keyof typeof PART_LABEL | null; estimated: boolean } | null;
  suggestion: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<"si" | "no">(todayLog?.period ? "si" : "no");
  const [symptoms, setSymptoms] = useState<Array<keyof typeof SYMPTOMS>>(todayLog?.symptoms ?? []);
  const [s, setS] = useState<CycleSettings>(settings ?? { avgLength: 28, periodDays: 5, lastStart: null, hormonal: "no", symptoms: [], symptomParts: [] });

  async function call(url: string, init: { method?: string; body?: unknown }, ok: string) {
    setBusy(true);
    try {
      await api(url, init);
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 py-4" aria-label="Mi ciclo">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">Mi ciclo</CardTitle>
        <p className="text-xs text-muted-foreground">Privado: cifrado, no se envía a la IA y tu entrenador no lo ve.</p>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 text-sm">
        {phase?.part ? (
          <p>
            Hoy: <strong>{PART_LABEL[phase.part]}</strong>
            {phase.day ? ` · día ${phase.day}` : ""}
            {phase.estimated ? <span className="text-xs text-muted-foreground"> (estimado)</span> : null}
          </p>
        ) : settings ? (
          <p className="text-muted-foreground">{settings.hormonal === "si" ? "Con anticonceptivo hormonal: se adapta solo por síntomas." : "Registra el inicio de tu regla para estimar la fase."}</p>
        ) : null}
        {suggestion ? <p className="rounded-md bg-muted/60 p-2">💡 {suggestion}: en tus sesiones del plan verás la opción de versión suave.</p> : null}

        <Field label="¿Hoy tienes la regla?">
          <Chips
            label="Regla hoy"
            options={[
              { value: "no", label: "No" },
              { value: "si", label: "Sí" },
            ]}
            value={period}
            onChange={(v) => setPeriod(v ?? "no")}
          />
        </Field>
        <Field label="Síntomas de hoy">
          <MultiChips label="Síntomas de hoy" options={opts(SYMPTOMS)} value={symptoms} onChange={setSymptoms} />
        </Field>
        <Button
          type="button"
          size="sm"
          className="w-fit"
          disabled={busy}
          onClick={() => void call("/api/health/cycle/log", { body: { date: today, period: period === "si", symptoms } }, "Registrado")}
        >
          Guardar hoy
        </Button>

        <details className="rounded-md border p-2">
          <summary className="cursor-pointer font-medium">{settings ? "Mis ajustes del ciclo" : "Configurar"}</summary>
          <div className="mt-2 grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Duración media" htmlFor="c-len">
                <Select id="c-len" value={s.avgLength} onChange={(e) => setS({ ...s, avgLength: Number(e.target.value) })}>
                  {Array.from({ length: 25 }, (_, i) => 21 + i).map((n) => (
                    <option key={n} value={n}>
                      {n} días
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Días de regla" htmlFor="c-pd">
                <Select id="c-pd" value={s.periodDays} onChange={(e) => setS({ ...s, periodDays: Number(e.target.value) })}>
                  {Array.from({ length: 7 }, (_, i) => 2 + i).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Inicio de la última regla" htmlFor="c-ls">
              <Input id="c-ls" type="date" value={s.lastStart ?? ""} onChange={(e) => setS({ ...s, lastStart: e.target.value || null })} />
            </Field>
            <Field label="Anticonceptivo hormonal">
              <Chips
                label="Anticonceptivo hormonal"
                options={[
                  { value: "no", label: "No" },
                  { value: "si", label: "Sí" },
                  { value: "nd", label: "Prefiero no decirlo" },
                ]}
                value={s.hormonal}
                onChange={(v) => setS({ ...s, hormonal: v ?? "no" })}
              />
            </Field>
            <Field label="¿Cuándo te cuesta más entrenar?">
              <MultiChips label="Cuándo te cuesta más" options={opts(CYCLE_PARTS)} value={s.symptomParts} onChange={(v) => setS({ ...s, symptomParts: v })} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => void call("/api/health/cycle", { method: "PUT", body: s }, "Ajustes guardados")}>
                Guardar ajustes
              </Button>
              {settings || todayLog ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("¿Borrar todos tus datos del ciclo? No se puede deshacer.")) void call("/api/health/cycle", { method: "DELETE" }, "Datos del ciclo borrados");
                  }}
                >
                  Borrar mis datos del ciclo
                </Button>
              ) : null}
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
