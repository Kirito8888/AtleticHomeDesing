"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

/** v1.9 · Antes de usar la app hay que aceptar la versión vigente de las condiciones (con su enlace). */
export function TermsGate({ version }: { version: string }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mx-auto grid max-w-lg gap-4 py-10 text-sm" aria-labelledby="terms-h">
      <h1 id="terms-h" className="text-xl font-semibold">
        Condiciones de uso de Atlenza
      </h1>
      <p>
        Atlenza es un programa de David Ornelas Luna con todos los derechos reservados. Para seguir, lee y acepta las condiciones de uso (versión {version}) y la política de privacidad.
      </p>
      <p className="flex gap-3">
        <a href="/legal/condiciones" target="_blank" rel="noopener" className="underline underline-offset-2">
          Condiciones de uso
        </a>
        <a href="/legal/privacidad" target="_blank" rel="noopener" className="underline underline-offset-2">
          Política de privacidad
        </a>
      </p>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 size-4" checked={ok} onChange={() => setOk(!ok)} />
        He leído y acepto las condiciones de uso y la política de privacidad.
      </label>
      <Button
        type="button"
        disabled={!ok || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api("/api/account/terms", { method: "POST" });
            router.refresh();
          } catch (e) {
            toast.error((e as Error).message);
            setBusy(false);
          }
        }}
        className="justify-self-start"
      >
        Aceptar y continuar
      </Button>
    </section>
  );
}
