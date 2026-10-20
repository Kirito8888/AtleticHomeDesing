"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { confirmDialog } from "@/components/ui/confirm-dialog";

/** Borrador de plan con IA: activar, regenerar o borrar. */
export function AiPlanActions({ code, status, overlapDays, canRegenerate = true }: { code: string; status: string; overlapDays: number; canRegenerate?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(kind: "activate" | "regenerate" | "delete") {
    if (kind === "delete" && !(await confirmDialog({ title: "¿Borrar este plan?", description: "Se quitan sus sesiones planificadas; lo que ya hiciste se queda.", confirmLabel: "Borrar", destructive: true }))) return;
    setBusy(kind);
    try {
      if (kind === "activate") {
        const r = await api<{ sessionsCreated: number }>(`/api/ai-plan/${code}/activate`, { method: "POST" });
        toast.success(`Plan activado: ${r.sessionsCreated} sesiones en tus entrenamientos`);
        router.refresh();
      } else if (kind === "regenerate") {
        const r = await api<{ code: string }>(`/api/ai-plan/${code}/regenerate`, { method: "POST" });
        toast.success("Plan regenerado");
        router.replace(`/planning/meso/${r.code}`);
      } else {
        await api(`/api/planning/plan/${code}`, { method: "DELETE" });
        router.replace(canRegenerate ? "/study/plan" : "/planning");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-2">
      {status === "DRAFT" ? (
        <>
          <p className="text-sm">
            Es un <strong>borrador</strong>: revísalo antes. Al activarlo, sus días pasan a tus entrenamientos como sesiones planificadas.
          </p>
          {overlapDays ? (
            <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm">
              Ojo: en esas fechas ya tienes {overlapDays} sesiones de otro plan (por ejemplo, el de tu entrenadora). Si lo activas, convivirán los dos.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy !== null} onClick={() => void run("activate")}>
              {busy === "activate" ? "Activando…" : "Activar en mis entrenamientos"}
            </Button>
            {canRegenerate ? (
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run("regenerate")}>
                {busy === "regenerate" ? "Generando…" : "Regenerar"}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void run("delete")}>
              Borrar
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Plan activo en tus entrenamientos.</p>
          <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void run("delete")}>
            Borrar plan
          </Button>
        </div>
      )}
    </div>
  );
}

/** «¿Cómo fue la semana N?» → guarda la valoración; los cambios se proponen aparte. */
export function WeekFeedback({ code, week }: { code: string; week: number }) {
  const router = useRouter();
  const [rating, setRating] = useState<"EASY" | "OK" | "HARD" | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await api(`/api/ai-plan/${code}/feedback`, { body: { week, rating, pain } });
      toast.success("Valoración guardada. Revisa los cambios propuestos: el plan no cambia hasta que los apliques.");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3" aria-label={`Valorar la semana ${week}`}>
      <Field label={`¿Cómo fue la semana ${week}?`}>
        <Chips
          label="Cómo fue la semana"
          options={[
            { value: "EASY", label: "Demasiado fácil" },
            { value: "OK", label: "Bien" },
            { value: "HARD", label: "Demasiado dura" },
          ]}
          value={rating}
          onChange={setRating}
        />
      </Field>
      <Field label="Dolor o molestias (0 = nada, 10 = mucho)">
        <Chips label="Dolor" options={[0, 2, 4, 6, 8].map((n) => ({ value: n, label: String(n) }))} value={pain} onChange={setPain} allowDeselect />
      </Field>
      <Button type="button" className="min-h-11 w-fit" disabled={!rating || busy} onClick={() => void send()}>
        Enviar valoración
      </Button>
    </div>
  );
}

export type ProposalDay = { dayId: string; code: string; title: string; label: string; toLight: boolean; rows: Array<{ exercise: string; before: string; after: string }> };

/** Cambios propuestos para la semana siguiente: nada se escribe hasta pulsar «Aplicar cambios». */
export function WeekFeedbackProposal({ code, week, version, days, pain }: { code: string; week: number; version: string; days: ProposalDay[]; pain: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    try {
      const r = await api<{ adjusted: number }>(`/api/ai-plan/${code}/feedback/apply`, { body: { week, version } });
      toast.success(`Semana ${week + 1} ajustada (${r.adjusted} ${r.adjusted === 1 ? "día" : "días"})`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border p-3" aria-label={`Cambios propuestos para la semana ${week + 1}`}>
      <h3 className="text-sm font-medium">Cambios propuestos para la semana {week + 1}</h3>
      <p className="text-xs text-muted-foreground">El plan sigue igual hasta que pulses «Aplicar cambios».{pain != null && pain >= 4 ? " Con dolor ≥ 4 la semana pasa a la versión suave." : ""}</p>
      <ul className="grid gap-2">
        {days.map((d) => (
          <li key={d.dayId} className="min-w-0 break-words rounded-md bg-muted/40 p-2 text-sm">
            <p className="font-medium">
              {d.label} · {d.title}
            </p>
            {d.toLight ? <p className="text-amber-700 dark:text-amber-400">Pasa a la versión suave (dolor ≥ 4)</p> : null}
            {d.rows.map((r, i) => (
              <p key={i} className="text-muted-foreground">
                {r.exercise}: {r.before} → {r.after}
              </p>
            ))}
          </li>
        ))}
      </ul>
      <Button type="button" className="min-h-11 w-full" disabled={busy} onClick={() => void apply()}>
        Aplicar cambios
      </Button>
    </section>
  );
}
