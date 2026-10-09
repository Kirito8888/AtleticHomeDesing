"use client";

import { CloudOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { flush, OUTBOX_EVENT, pending } from "@/lib/offline/outbox";

/** Envía la bandeja de salida al volver la conexión y muestra cuántas sesiones esperan. */
export function OutboxSync() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const running = useRef(false);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      pending()
        .then((p) => alive && setCount(p.length))
        .catch(() => undefined);
    const send = async () => {
      if (!navigator.onLine || running.current) return refresh();
      running.current = true;
      try {
        const r = await flush();
        if (r.sent) {
          toast.success(`${r.sent} sesión(es) guardada(s) sin conexión ya enviadas`);
          router.refresh();
        }
        for (const x of r.rejected) toast.error(`No se pudo guardar «${x.label}»: ${x.error}`);
      } catch {
        // IndexedDB no disponible (modo privado): no hay bandeja
      } finally {
        running.current = false;
      }
      void refresh();
    };
    void send();
    window.addEventListener("online", send);
    window.addEventListener(OUTBOX_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener("online", send);
      window.removeEventListener(OUTBOX_EVENT, refresh);
    };
  }, [router]);

  if (!count) return null;
  return (
    <p role="status" className="mb-3 flex items-center gap-2 rounded-md border border-dashed p-2 text-sm text-muted-foreground">
      <CloudOff className="size-4" /> {count} sesión(es) sin enviar: se mandan solas al volver la conexión.
    </p>
  );
}
