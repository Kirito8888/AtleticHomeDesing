"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Chips } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { AUDIENCES, type Audience } from "@/lib/demo/audiences";

/** v1.7 · Crear y borrar cuentas demo por tipo de público (datos sintéticos, caducan a los 30 días). */
export function DemoAccounts({ accounts }: { accounts: Array<{ id: string; email: string; demoAudience: string | null; demoExpiresAt: string }> }) {
  const router = useRouter();
  const [audience, setAudience] = useState<Audience | null>("BEGINNER");
  const [created, setCreated] = useState<{ email: string; password: string; audience: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      setCreated(await api("/api/admin/demo", { body: { audience } }));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 grid gap-2 border-t pt-3 text-sm">
      <p className="font-medium">Cuentas de demostración</p>
      <p className="text-xs text-muted-foreground">Para probar la app como otro tipo de persona. Datos inventados (sin relación con nadie real), correo que no existe y borrado automático a los 30 días.</p>
      <Chips label="Tipo de público" options={(Object.keys(AUDIENCES) as Audience[]).map((k) => ({ value: k, label: AUDIENCES[k] }))} value={audience} onChange={setAudience} />
      <Button type="button" variant="outline" size="sm" className="justify-self-start" disabled={busy || !audience} onClick={create}>
        {busy ? "Creando…" : "Crear cuenta demo"}
      </Button>
      {created ? (
        <div className="grid gap-1 rounded-md border p-2 text-xs" role="status">
          <span>
            {created.audience}: <span className="font-mono">{created.email}</span>
          </span>
          <span>
            Contraseña: <span className="font-mono" aria-label="Contraseña de la cuenta demo">{created.password}</span>
          </span>
          <span className="text-muted-foreground">Solo se muestra ahora. Entra en otra ventana privada para no cerrar tu sesión.</span>
        </div>
      ) : null}
      {accounts.length ? (
        <ul className="grid gap-1 text-xs" aria-label="Cuentas demo">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {AUDIENCES[a.demoAudience as Audience] ?? a.demoAudience} · {a.email} · hasta el {new Date(a.demoExpiresAt).toLocaleDateString("es-ES")}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (!confirm(`¿Borrar ${a.email}?`)) return;
                  try {
                    await api(`/api/admin/demo/${a.id}`, { method: "DELETE" });
                    router.refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Borrar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
