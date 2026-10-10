"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { trashedToast } from "@/lib/trash-client";

export function DeleteEntry({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={`Quitar ${name}`}
      onClick={async () => {
        try {
          const r = await api<{ trashId?: string }>(`/api/nutrition/entries/${id}`, { method: "DELETE" });
          trashedToast(r.trashId, `${name} quitado`, () => router.refresh());
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      <X className="size-4" />
    </Button>
  );
}

/** Rico en hierro: un toque (se usa en Salud de la mujer). Estado local para que el toque se vea al momento. */
export function IronToggle({ id, name, initial }: { id: string; name: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Quitar «rico en hierro» de ${name}` : `Marcar ${name} como rico en hierro`}
      title="Rico en hierro"
      className={on ? "rounded px-1 text-xs font-semibold text-rose-700 dark:text-rose-400" : "rounded px-1 text-xs text-muted-foreground opacity-50 hover:opacity-100"}
      onClick={async () => {
        setOn(!on);
        try {
          await api(`/api/nutrition/entries/${id}`, { method: "PATCH", body: { ironRich: !on } });
        } catch (e) {
          setOn(on);
          toast.error((e as Error).message);
        }
      }}
    >
      Fe
    </button>
  );
}
