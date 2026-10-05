"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { StatusLabel, type Status } from "@/components/status";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";

export interface CoachReportView {
  id: string;
  weekStart: string;
  model: string;
  report: {
    summary: string;
    riskLevel: "LOW" | "MODERATE" | "HIGH";
    keyFindings: string[];
    recommendations: Array<{ area: string; action: string; rationale: string; priority: "HIGH" | "MEDIUM" | "LOW" }>;
    nextWeek: { targetTssMin: number; targetTssMax: number; maxHardSessions: number; notes: string };
    dataGaps: string[];
  };
}

const RISK: Record<CoachReportView["report"]["riskLevel"], { status: Status; label: string }> = {
  LOW: { status: "good", label: "Riesgo bajo" },
  MODERATE: { status: "warning", label: "Riesgo moderado" },
  HIGH: { status: "critical", label: "Riesgo alto" },
};
const AREA: Record<string, string> = {
  LOAD: "Carga",
  RECOVERY: "Recuperación",
  SLEEP: "Sueño",
  TECHNIQUE: "Técnica",
  STRENGTH: "Fuerza",
  NUTRITION: "Nutrición",
  COMPETITION: "Competición",
};
const PRIO = { HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" } as const;

export function CoachPanel({ reports, aiEnabled }: { reports: CoachReportView[]; aiEnabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const latest = reports[0];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Analiza la semana pasada: carga (pista/técnica/fuerza) frente a VFC, sueño y readiness.</p>
        <Button
          disabled={!aiEnabled || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/api/ai/coach/weekly", { body: {} });
              toast.success("Informe generado");
              router.refresh();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Sparkles /> {busy ? "Analizando…" : "Generar informe"}
        </Button>
      </div>

      {latest ? (
        <article className="grid gap-4 rounded-lg border p-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Semana del {formatDate(latest.weekStart, { day: "numeric", month: "long" })}</h3>
            <StatusLabel status={RISK[latest.report.riskLevel].status}>{RISK[latest.report.riskLevel].label}</StatusLabel>
          </header>
          <p className="text-sm whitespace-pre-wrap">{latest.report.summary}</p>
          {latest.report.keyFindings.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {latest.report.keyFindings.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-2">
            <h4 className="text-sm font-semibold">Recomendaciones</h4>
            {latest.report.recommendations.map((r, i) => (
              <div key={i} className="rounded-md bg-muted p-3 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{AREA[r.area] ?? r.area}</span>
                  <span>Prioridad {PRIO[r.priority]}</span>
                </div>
                <p className="font-medium">{r.action}</p>
                <p className="text-xs text-muted-foreground">{r.rationale}</p>
              </div>
            ))}
          </div>
          <div className="rounded-md border p-3 text-sm">
            <span className="font-semibold">Próxima semana:</span> {latest.report.nextWeek.targetTssMin}–{latest.report.nextWeek.targetTssMax} TSS, máx.{" "}
            {latest.report.nextWeek.maxHardSessions} sesiones duras. {latest.report.nextWeek.notes}
          </div>
          {latest.report.dataGaps.length ? (
            <p className="text-xs text-muted-foreground">Datos que faltan: {latest.report.dataGaps.join(" · ")}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">Generado por {latest.model}. No sustituye el criterio de un profesional sanitario.</p>
        </article>
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay informes.</p>
      )}

      {reports.length > 1 ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Informes anteriores</summary>
          <ul className="mt-2 grid gap-1 text-sm">
            {reports.slice(1).map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span>Semana del {formatDate(r.weekStart)}</span>
                <StatusLabel status={RISK[r.report.riskLevel].status} className="text-xs">
                  {RISK[r.report.riskLevel].label}
                </StatusLabel>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
