"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useRef, useState } from "react";

import { api } from "@/lib/client-api";

/**
 * v2.11 B3 · O16 · Refresco por zonas. Una «zona» (lista de movimientos, día de nutrición…) guarda sus datos en estado
 * y los recarga con UN `GET` JSON acotado, en vez de `router.refresh()` (que rehace layout y página enteros).
 * Los componentes llaman a `useZoneRefresh()`: dentro de una zona recargan solo la zona; fuera, siguen con `router.refresh()`.
 */
const ZoneContext = createContext<(() => Promise<void>) | null>(null);

export function ZoneProvider({ reload, children }: { reload: () => Promise<void>; children: React.ReactNode }) {
  return <ZoneContext.Provider value={reload}>{children}</ZoneContext.Provider>;
}

/** Función de refresco para los componentes de una zona (o `router.refresh()` si no hay zona). */
export function useZoneRefresh(): () => void {
  const zone = useContext(ZoneContext);
  const router = useRouter();
  return useCallback(() => {
    if (zone) void zone();
    else router.refresh();
  }, [zone, router]);
}

/**
 * Datos de una zona: arranca con lo que renderizó el servidor y `reload()` los sustituye por el `GET` de `url`.
 * Si llega una página nueva del servidor (navegación o un `router.refresh()` de algo ajeno a la zona), gana ella.
 * Descarta respuestas fuera de orden; si el `GET` falla, recurre a `router.refresh()`.
 */
export function useZoneData<T>(initial: T, url: string) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setData(initial);
  }
  const ticket = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const next = await api<T>(url);
      if (mine === ticket.current) setData(next);
    } catch {
      if (mine === ticket.current) router.refresh();
    }
  }, [router, url]);
  return { data, reload };
}
