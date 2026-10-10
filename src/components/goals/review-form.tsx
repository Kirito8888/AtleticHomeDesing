"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/client-api";

/** v1.8 · Las tres preguntas del domingo. El foco aparece en el panel toda la semana siguiente. */
export function ReviewForm({ weekStart, initial }: { weekStart: string; initial: { wentWell: string; change: string; focus: string } }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/review", { method: "PUT", body: { weekStart, ...v } });
          toast.success("Revisión guardada");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="¿Qué ha ido bien?" htmlFor="rv-well">
        <Textarea id="rv-well" maxLength={500} rows={2} value={v.wentWell} onChange={(e) => setV({ ...v, wentWell: e.target.value })} />
      </Field>
      <Field label="¿Qué cambiarías?" htmlFor="rv-change">
        <Textarea id="rv-change" maxLength={500} rows={2} value={v.change} onChange={(e) => setV({ ...v, change: e.target.value })} />
      </Field>
      <Field label="Foco de la próxima semana" htmlFor="rv-focus" hint="Una frase: la verás en el panel">
        <Input id="rv-focus" maxLength={120} value={v.focus} onChange={(e) => setV({ ...v, focus: e.target.value })} />
      </Field>
      <Button type="submit" disabled={busy} className="justify-self-start">
        {busy ? "Guardando…" : "Guardar revisión"}
      </Button>
    </form>
  );
}
