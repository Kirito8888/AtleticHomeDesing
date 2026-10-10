"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

const KIND = { SESSION: "Sesión", MEAL: "Comida", TRANSACTION: "Movimiento" } as const;

/** v1.8 · Papelera: recuperar lo borrado en los últimos 7 días. */
export function TrashList({ items }: { items: Array<{ id: string; kind: string; label: string; deletedAt: string; daysLeft: number }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return <p className="text-sm text-muted-foreground">La papelera está vacía.</p>;
  return (
    <ul className="grid gap-2 text-sm" aria-label="Papelera">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
          <span className="min-w-0">
            <span className="block truncate font-medium">{it.label}</span>
            <span className="text-xs text-muted-foreground">
              {KIND[it.kind as keyof typeof KIND] ?? it.kind} · se borra del todo en {it.daysLeft} {it.daysLeft === 1 ? "día" : "días"}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy === it.id}
            onClick={async () => {
              setBusy(it.id);
              try {
                await api(`/api/trash/${it.id}/restore`, { method: "POST" });
                toast.success(`Recuperado: ${it.label}`);
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setBusy(null);
              }
            }}
          >
            Recuperar
          </Button>
        </li>
      ))}
    </ul>
  );
}
