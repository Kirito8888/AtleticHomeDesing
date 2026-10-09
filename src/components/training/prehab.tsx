"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export function AddPrehab({ templates }: { templates: Array<{ key: string; name: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      {templates.map((t) => (
        <Button
          key={t.key}
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/api/training/prehab", { body: { template: t.key } });
              toast.success(`Rutina «${t.name}» añadida`);
              router.refresh();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          + {t.name}
        </Button>
      ))}
    </div>
  );
}

/** Marcar hoy con un toque (estado local para que se vea al momento) y archivar. */
export function PrehabActions({ id, name, today, done }: { id: string; name: string; today: string; done: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(done);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        role="checkbox"
        aria-checked={on}
        aria-label={`Hecha hoy: ${name}`}
        variant={on ? "default" : "outline"}
        onClick={async () => {
          setOn(!on);
          try {
            await api(`/api/training/prehab/${id}/toggle`, { body: { date: today } });
            router.refresh();
          } catch (e) {
            setOn(on);
            toast.error((e as Error).message);
          }
        }}
      >
        {on ? "Hecha hoy ✓" : "Marcar hecha hoy"}
      </Button>
      <button
        type="button"
        className={cn("text-xs text-muted-foreground underline-offset-2 hover:underline")}
        onClick={async () => {
          if (!confirm(`¿Archivar «${name}»?`)) return;
          try {
            await api(`/api/training/prehab/${id}`, { method: "PATCH", body: { archived: true } });
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        Archivar
      </button>
    </div>
  );
}
