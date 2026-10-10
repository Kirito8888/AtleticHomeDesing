"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

/** v1.7 · Tras rotar las claves (las viejas en *_PREVIOUS): vuelve a cifrar todo con la nueva. */
export function RotateKeys() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, { rotated: number; current: number; failed: number }> | null>(null);
  async function run() {
    if (!confirm("¿Volver a cifrar todos los datos cifrados con la clave actual? Hazlo solo después de poner la clave anterior en *_PREVIOUS.")) return;
    setBusy(true);
    try {
      setResult(await api("/api/admin/rotate-keys", { method: "POST" }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 grid gap-2 border-t pt-3 text-sm">
      <p className="text-muted-foreground">Rotación de claves de cifrado (manual de despliegue § 8).</p>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={run} disabled={busy}>
        {busy ? "Cifrando…" : "Volver a cifrar con la clave nueva"}
      </Button>
      {result ? (
        <ul className="grid gap-0.5 text-xs" aria-label="Resultado de la rotación">
          {Object.entries(result).map(([k, r]) => (
            <li key={k} className={r.failed ? "text-destructive" : undefined}>
              {k}: {r.rotated} recifrados, {r.current} ya estaban, {r.failed} sin poder abrir
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
