"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Al abrir el centro de notificaciones, todo queda como leído (la campana se pone a cero). */
export function MarkAllRead({ unread }: { unread: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!unread) return;
    void fetch("/api/notifications", { method: "POST" }).then(() => router.refresh());
  }, [unread, router]);
  return null;
}

/** v1.8 · Posponer una notificación 1 h (vuelve a llegar y queda como no leída). */
export function SnoozeButton({ id, until }: { id: string; until: string | null }) {
  const router = useRouter();
  if (until) {
    const hhmm = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(until));
    return <span className="text-xs text-muted-foreground">Te lo recuerdo a las {hhmm}</span>;
  }
  return (
    <button
      type="button"
      className="text-xs font-medium underline underline-offset-2"
      onClick={async () => {
        const r = await fetch("/api/push/snooze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
        if (r.ok) router.refresh();
      }}
    >
      Recordar en 1 h
    </button>
  );
}
