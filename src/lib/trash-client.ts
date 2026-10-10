"use client";

import { toast } from "sonner";

import { api } from "@/lib/client-api";

/** v1.8 · Aviso con «Deshacer» tras mandar algo a la papelera (7 días). */
export function trashedToast(trashId: string | undefined, label: string, refresh: () => void) {
  if (!trashId) return toast.success(label);
  toast.success(`${label} (en la papelera 7 días)`, {
    duration: 10_000,
    action: {
      label: "Deshacer",
      onClick: async () => {
        try {
          await api(`/api/trash/${trashId}/restore`, { method: "POST" });
          toast.success("Recuperado");
          refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      },
    },
  });
}
