"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/client-api";
import { formatDec, formatInt } from "@/lib/format";
import { ENERGY_GOAL_LABEL, type EnergyGoal, MAX_DEFICIT, MAX_SURPLUS, MAX_WEEKLY_CHANGE } from "@/lib/nutrition/expenditure";
import type { ExpenditureView } from "@/lib/nutrition/expenditure-service";

const GOALS: EnergyGoal[] = ["maintain", "lose", "gain"];

export function ExpenditurePanel({ view }: { view: ExpenditureView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { estimate, draft, current } = view;

  async function setGoal(goal: EnergyGoal | null) {
    if (!goal || goal === view.energyGoal) return;
    setBusy(true);
    try {
      await api("/api/settings/prefs", { method: "PATCH", body: { energyGoal: goal } });
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (draft?.status !== "draft") return;
    setBusy(true);
    try {
      await api("/api/nutrition/goals", {
        body: { effectiveFrom: view.today, ...draft.goal, fiberG: current?.fiberG ?? null, trainingDayKcalFactor: current?.trainingDayKcalFactor ?? 1 },
      });
      toast.success(`Objetivo actualizado: ${formatInt(draft.goal.kcal)} kcal desde hoy`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card data-testid="expenditure-estimate">
        <CardHeader>
          <CardTitle>Tu gasto estimado</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {estimate.status === "calibrating" ? (
            <>
              <p className="font-medium">Aún calibrando</p>
              <p className="text-muted-foreground">Sin datos suficientes no damos un número: sería inventado.</p>
              <ul className="list-disc pl-5">
                {estimate.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                Anota lo que comes en <Link href="/nutrition" className="underline">Nutrición</Link> y pésate en{" "}
                <Link href="/recovery" className="underline">Recuperación</Link> (mejor en ayunas, varias veces por semana).
              </p>
            </>
          ) : estimate.status === "incoherent" ? (
            <p role="alert">{estimate.reason}</p>
          ) : (
            <>
              <p className="text-3xl font-semibold tabular-nums" data-testid="expenditure-kcal">
                ≈ {formatInt(estimate.kcal)} kcal/día
              </p>
              <p className="text-muted-foreground">Margen aproximado: ± {formatInt(estimate.marginKcal)} kcal. Es una estimación, no una medida.</p>
              <details>
                <summary className="min-h-11 cursor-pointer py-2">Por qué este número</summary>
                <ul className="grid gap-1 pl-1">
                  <li>
                    Comes de media {formatInt(estimate.avgIntakeKcal)} kcal/día ({estimate.intakeDays} días completos
                    {estimate.excludedDays ? `; ${estimate.excludedDays} día(s) con muy poco anotado no cuentan` : ""}).
                  </li>
                  <li>
                    Tu peso tendencia ({formatDec(estimate.trendWeightKg, 1)} kg, {estimate.weighIns} pesajes) cambia {estimate.weeklyChangeKg > 0 ? "+" : ""}
                    {formatDec(estimate.weeklyChangeKg, 2)} kg/semana.
                  </li>
                  <li>Gasto ≈ lo que comes − cambio de peso × 7.700 kcal/kg.</li>
                </ul>
              </details>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qué buscas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <Chips
            label="Meta de peso"
            value={view.energyGoal}
            onChange={(v) => void setGoal(v)}
            options={GOALS.filter((g) => !view.minor || g === "maintain").map((g) => ({ value: g, label: ENERGY_GOAL_LABEL[g] }))}
          />
          <p className="text-muted-foreground">
            Cambios suaves: como mucho {MAX_DEFICIT} kcal/día por debajo o {MAX_SURPLUS} por encima de tu gasto, y el objetivo se mueve {MAX_WEEKLY_CHANGE} kcal por semana como mucho.
            Comer poco entrenando afecta al rendimiento, la salud ósea y la hormonal.
          </p>
          <p className="text-muted-foreground" data-testid="expenditure-professional">
            Si quieres cambiar de peso, hazlo con un dietista-nutricionista colegiado, mejor si trabaja con deportistas.
          </p>
        </CardContent>
      </Card>

      {draft ? (
        <Card data-testid="expenditure-draft">
          <CardHeader>
            <CardTitle>Borrador de esta semana</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {draft.status === "none" ? (
              <p>{draft.reason}</p>
            ) : (
              <>
                {draft.note ? <p role="note">{draft.note}</p> : null}
                <dl className="grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-muted-foreground">Ahora</dt>
                    <dd className="tabular-nums">{current ? `${formatInt(current.kcal)} kcal` : "Sin objetivo"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Propuesta</dt>
                    <dd className="font-semibold tabular-nums" data-testid="draft-kcal">
                      {formatInt(draft.goal.kcal)} kcal
                    </dd>
                  </div>
                </dl>
                <p className="text-muted-foreground tabular-nums">
                  Proteína {draft.goal.proteinG} g · Hidratos {draft.goal.carbsG} g · Grasa {draft.goal.fatG} g
                  {current ? " (se conservan tu proteína y tu grasa; cambian los hidratos)" : ""}
                </p>
                {draft.capped ? (
                  <p className="text-muted-foreground">
                    Vas hacia {formatInt(draft.targetKcal)} kcal poco a poco: esta semana como mucho {MAX_WEEKLY_CHANGE} kcal de cambio.
                  </p>
                ) : null}
                <p className="text-muted-foreground">Nada cambia hasta que aceptes. Lo puedes editar después en <Link href="/settings#nutricion" className="underline">Ajustes → Objetivo nutricional diario</Link>.</p>
                <Button type="button" className="min-h-11" disabled={busy} onClick={() => void accept()}>
                  Aceptar como objetivo desde hoy
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
