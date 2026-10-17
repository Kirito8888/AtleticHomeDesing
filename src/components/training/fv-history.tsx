"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { FvResultCard } from "@/components/training/fv-profile-form";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import type { FvResult } from "@/lib/training/fv-profile";

export type FvHistoryItem = { id: string; date: string; bodyMassKg: number; hpoCm: number; loads: { addedKg: number; heightCm: number }[]; result: FvResult };

export function FvHistory({ items }: { items: FvHistoryItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(id: string) {
    setBusy(id);
    try {
      await api(`/api/training/tests/fv/${id}`, { method: "DELETE" });
      toast.success("Serie borrada");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) return <p className="text-sm text-muted-foreground">Aún no has guardado ningún perfil F-V.</p>;
  return (
    <ul className="grid gap-3" aria-label="Histórico de perfiles F-V">
      {items.map((s) => (
        <li key={s.id} className="grid gap-2 rounded-md border p-3" data-fv-item>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-sm font-medium tabular-nums">
              {s.date} · {s.bodyMassKg} kg · hPO {s.hpoCm} cm
            </p>
            <Button type="button" variant="ghost" className="min-h-11 shrink-0" disabled={busy === s.id} aria-label={`Borrar serie del ${s.date}`} onClick={() => remove(s.id)}>
              Borrar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">{s.loads.map((l) => `+${l.addedKg} kg → ${l.heightCm} cm`).join(" · ")}</p>
          {s.result.ok ? <FvResultCard p={s.result.profile} warnings={s.result.warnings} /> : <p className="text-sm">{s.result.error}</p>}
        </li>
      ))}
    </ul>
  );
}
