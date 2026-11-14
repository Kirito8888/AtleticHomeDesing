"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

/**
 * Vínculos anteriores traían «Recuperación y lesiones» premarcado. Son datos de salud (art. 9 RGPD): la entrenadora o el club
 * no los ven hasta que la atleta lo confirma de forma expresa (o lo quita).
 */
export function RecoveryConsentNotice() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (confirm: boolean) => {
    setBusy(true);
    try {
      await api("/api/coach/recovery-consent", { method: "POST", body: { confirm } });
      toast.success(confirm ? "Confirmado: tu entrenadora o club verá tu recuperación y lesiones" : "Quitado: no verán tu recuperación ni tus lesiones");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="rc-title" role="status" className="mb-4 grid gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <h2 id="rc-title" className="font-medium">
        Confirma qué datos de salud ven tu entrenadora o tu club
      </h2>
      <p>
        Tu vínculo tenía marcado «Recuperación y lesiones» (sueño, VFC, FC en reposo, lesiones). Son datos de salud: no los ven hasta que lo confirmes. Puedes quitarlo cuando quieras en Ajustes.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="min-h-11" disabled={busy} onClick={() => act(true)}>
          Confirmar
        </Button>
        <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => act(false)}>
          Quitar ese permiso
        </Button>
      </div>
    </section>
  );
}
