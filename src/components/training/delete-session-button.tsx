"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

export function DeleteSessionButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        if (!confirm("¿Borrar esta sesión? La carga (PMC) se recalculará.")) return;
        try {
          await api(`/api/training/sessions/${id}`, { method: "DELETE" });
          toast.success("Sesión borrada");
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
