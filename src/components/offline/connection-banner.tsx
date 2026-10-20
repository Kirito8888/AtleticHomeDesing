"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/** Aviso mientras no hay red. La cola de envíos pendientes (OutboxSync) no se toca. */
export function ConnectionBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  if (!offline) return null;
  return (
    <p role="status" className="mb-3 flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      Sin conexión. Lo que guardes se enviará al volver.
    </p>
  );
}
