"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

/** Afinamiento: recorta las series de los días previos al mostrarlos; el plan original no cambia y se puede quitar. */
export function TaperCard({ eventId, pct, nDays, days, applied }: { eventId: string; pct: number; nDays: number; days: Array<{ id: string; title: string; date: string | null }>; applied: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function set(apply: boolean) {
    setBusy(true);
    try {
      const r = await api<{ days: number }>("/api/planning/taper", { body: { eventId, apply } });
      toast.success(apply ? `Afinamiento aplicado a ${r.days} días` : "Afinamiento quitado: vuelve el plan original");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!days.length) return <p className="text-sm text-muted-foreground">No hay días pendientes del plan en los {nDays} días previos.</p>;
  return (
    <div className="grid gap-2 text-sm">
      <p>
        {applied ? "Aplicado" : "Propuesta"}: −{pct} % de series en {days.length} días ({nDays} días antes). Los kg y las repeticiones no cambian. El plan original se
        conserva y lo verás en «Cómo lo hago».
      </p>
      <ul className="grid gap-0.5 text-xs text-muted-foreground" aria-label="Días que se afinan">
        {days.map((d) => (
          <li key={d.id}>
            {d.date} · {d.title}
          </li>
        ))}
      </ul>
      <Button type="button" variant={applied ? "outline" : "default"} disabled={busy} onClick={() => set(!applied)}>
        {applied ? "Quitar el afinamiento" : "Aplicar el afinamiento"}
      </Button>
    </div>
  );
}
