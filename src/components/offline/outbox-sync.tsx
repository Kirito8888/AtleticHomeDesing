"use client";

import { CloudOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { flush, OUTBOX_EVENT, pending, setOutboxOwner } from "@/lib/offline/outbox";

/** Cada cuánto se reintenta mientras quede algo (iOS no siempre avisa con «online»). */
const RETRY_MS = 30_000;

/**
 * Envía la bandeja de salida al volver la conexión y muestra cuántos registros esperan.
 * v3.2 J: fija la dueña de la bandeja, reintenta al volver a la app y cada 30 s, y «Enviar ahora».
 */
export function OutboxSync({ owner }: { owner: string }) {
  // Antes que los efectos de las páginas hijas: así sus borradores y envíos ya saben de quién son
  setOutboxOwner(owner);
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);

  const refresh = useCallback(
    () =>
      pending()
        .then((p) => alive.current && setCount(p.length))
        .catch(() => undefined),
    [],
  );

  const send = useCallback(async () => {
    if (!navigator.onLine || running.current) return refresh();
    running.current = true;
    setBusy(true);
    try {
      const r = await flush();
      if (r.sent) {
        toast.success(`${r.sent} registro(s) guardado(s) sin conexión ya enviados`);
        router.refresh();
      }
      for (const x of r.rejected) toast.error(`No se pudo guardar «${x.label}»: ${x.error}`);
    } catch {
      // IndexedDB no disponible (modo privado): no hay bandeja
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
    void refresh();
  }, [refresh, router]);

  useEffect(() => {
    alive.current = true;
    void send();
    const onVisible = () => document.visibilityState === "visible" && void send();
    window.addEventListener("online", send);
    window.addEventListener(OUTBOX_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      window.removeEventListener("online", send);
      window.removeEventListener(OUTBOX_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [send, refresh]);

  useEffect(() => {
    if (!count) return;
    const t = setInterval(() => void send(), RETRY_MS);
    return () => clearInterval(t);
  }, [count, send]);

  if (!count) return null;
  return (
    <div role="status" data-testid="outbox-pending" className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-sm text-muted-foreground">
      <CloudOff className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{count} registro(s) sin enviar: se mandan solos al volver la conexión.</span>
      <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={busy} onClick={() => void send()}>
        {busy ? "Enviando…" : "Enviar ahora"}
      </Button>
    </div>
  );
}
