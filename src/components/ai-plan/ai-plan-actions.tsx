"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

/** Borrador de plan con IA: activar, regenerar o borrar. */
export function AiPlanActions({ code, status, overlapDays }: { code: string; status: string; overlapDays: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(kind: "activate" | "regenerate" | "delete") {
    if (kind === "delete" && !confirm("¿Borrar este plan? Se quitan sus sesiones planificadas; lo que ya hiciste se queda.")) return;
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
        router.replace("/study/plan");
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
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run("regenerate")}>
              {busy === "regenerate" ? "Generando…" : "Regenerar"}
            </Button>
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

/** «¿Cómo fue la semana N?» → ajusta la siguiente. */
export function WeekFeedback({ code, week }: { code: string; week: number }) {
  const router = useRouter();
  const [rating, setRating] = useState<"EASY" | "OK" | "HARD" | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const r = await api<{ adjusted: number }>(`/api/ai-plan/${code}/feedback`, { body: { week, rating, pain } });
      toast.success(r.adjusted ? `Semana ${week + 1} ajustada (${r.adjusted} días)` : "Gracias: la semana siguiente se queda igual");
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
      <Button type="button" className="w-fit" disabled={!rating || busy} onClick={() => void send()}>
        Ajustar la semana siguiente
      </Button>
    </div>
  );
}
