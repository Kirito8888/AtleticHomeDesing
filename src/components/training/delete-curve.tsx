"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { confirmDialog } from "@/components/ui/confirm-dialog";

export function DeleteCurve({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="w-fit"
      onClick={async () => {
        if (!(await confirmDialog({ title: "¿Borrar esta curva?", confirmLabel: "Borrar", destructive: true }))) return;
        try {
          await api(`/api/training/reference-curves/${id}`, { method: "DELETE" });
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    >
      Borrar
    </Button>
  );
}
