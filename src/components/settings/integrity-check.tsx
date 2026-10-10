"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

type Result = { orphanFiles: number; missingFiles: number; sessionsNoTss: number; staleLoads: number; ok: boolean };

/** v1.8 · Revisar la integridad ahora (solo informa: no cambia nada). */
export function IntegrityCheck() {
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<Result | null>(null);
  return (
    <div className="mt-4 grid gap-2 border-t pt-3 text-sm">
      <p className="text-muted-foreground">Revisión de integridad: ficheros y registros, TSS y carga. Se hace sola los lunes y te avisa si encuentra algo.</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="justify-self-start"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setR(await api("/api/admin/integrity", { method: "POST" }));
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Revisando…" : "Revisar ahora"}
      </Button>
      {r ? (
        <p role="status" className={r.ok ? "text-xs" : "text-xs font-medium text-destructive"}>
          {r.ok
            ? "Todo en orden."
            : `${r.orphanFiles} ficheros sin registro · ${r.missingFiles} registros sin fichero · ${r.sessionsNoTss} sesiones sin TSS (Entreno → Recalcular) · ${r.staleLoads} cargas sin actualizar.`}
        </p>
      ) : null}
    </div>
  );
}
