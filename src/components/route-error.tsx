"use client";

import { Button } from "@/components/ui/button";

/** Fallo de red al pedir la página (sin conexión): no es un fallo de la app. */
export function isOfflineError(error: Error) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return offline || /Failed to fetch|fetch failed|NetworkError|Load failed/i.test(error.message);
}

/** Límite de error común: si algo falla al pintar, el resto de la app sigue en pie y se puede reintentar. */
export function RouteError({ where, error, reset }: { where: string; error: Error & { digest?: string }; reset: () => void }) {
  // Un fallo de carga de fichero (p. ej. justo tras actualizar la app) se arregla recargando la página entera.
  const stale = error.name === "ChunkLoadError" || /Loading chunk|Failed to load chunk|dynamically imported module/i.test(error.message);
  const offline = !stale && isOfflineError(error);
  return (
    <div role="alert" className="grid gap-3 rounded-md border p-4 text-sm">
      <p className="font-medium">{offline ? "Sin conexión" : `${where} no se ha podido mostrar.`}</p>
      <p className="text-muted-foreground">
        {offline
          ? "No hay red ahora mismo. Tus datos no se han tocado; reintenta cuando vuelva la conexión."
          : stale
            ? "La app se ha actualizado: recarga la página."
            : "Tus datos no se han tocado. Inténtalo de nuevo; si sigue igual, cuéntalo con este código:"}{" "}
        {stale || offline ? null : <code className="text-xs">{error.digest ?? error.name}</code>}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => (stale ? window.location.reload() : reset())}>
          {stale ? "Recargar" : "Reintentar"}
        </Button>
      </div>
    </div>
  );
}
