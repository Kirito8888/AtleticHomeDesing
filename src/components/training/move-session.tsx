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
