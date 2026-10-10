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
