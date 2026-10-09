"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";

/** Mover o duplicar una sesión planificada a otro día. */
export function MoveSession({ id, date }: { id: string; date: string }) {
  const router = useRouter();
  const [to, setTo] = useState(date);
  const [busy, setBusy] = useState(false);
  async function go(copy: boolean) {
    setBusy(true);
    try {
      const r = await api<{ id: string; warning: string | null }>(`/api/training/sessions/${id}/move`, { body: { date: to, copy } });
      if (r.warning) toast.warning(r.warning);
      else toast.success(copy ? "Sesión duplicada" : "Sesión movida");
      router.push(`/training/${r.id}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="mb-4 rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Mover o duplicar</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs">
          Nuevo día
          <Input type="date" aria-label="Nuevo día" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button type="button" size="sm" disabled={busy || to === date} onClick={() => go(false)}>
          Mover
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => go(true)}>
          Duplicar
        </Button>
      </div>
    </details>
  );
}

/** v1.6 · Sesión planificada que no se hizo: propuestas de día y moverla con un toque. */
export function RescheduleCard({ id, date, options }: { id: string; date: string; options: Array<{ date: string; notes: string[] }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function move(to: string) {
    setBusy(true);
    try {
      const r = await api<{ id: string; warning: string | null }>(`/api/training/sessions/${id}/move`, { body: { date: to, copy: false } });
      if (r.warning) toast.warning(r.warning);
      else toast.success("Sesión recolocada");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Recolocar la sesión" className="mb-4 grid gap-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
      <p>
        Estaba planificada para el {new Date(`${date}T00:00:00Z`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} y no está registrada. ¿La recolocas?
      </p>
      {options.length ? (
        <ul className="grid gap-1.5">
          {options.map((o) => (
            <li key={o.date} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {new Date(`${o.date}T00:00:00Z`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                {o.notes.length ? <span className="text-xs text-muted-foreground"> · {o.notes.join(", ")}</span> : null}
              </span>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => move(o.date)}>
                Mover aquí
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No hay ningún día en la próxima semana que respete las horas entre lanzamientos.</p>
      )}
    </section>
  );
}
