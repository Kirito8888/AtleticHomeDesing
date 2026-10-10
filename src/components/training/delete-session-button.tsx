"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { trashedToast } from "@/lib/trash-client";

export function DeleteSessionButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        if (!confirm("¿Borrar esta sesión? La carga (PMC) se recalculará. Podrás recuperarla 7 días desde Ajustes → Papelera.")) return;
        try {
          const r = await api<{ trashId?: string }>(`/api/training/sessions/${id}`, { method: "DELETE" });
          trashedToast(r.trashId, "Sesión borrada", () => router.refresh());
          router.push("/training");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      <Trash2 /> Borrar
    </Button>
  );
}
