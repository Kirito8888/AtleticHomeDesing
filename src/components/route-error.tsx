"use client";

import { Button } from "@/components/ui/button";

/** Límite de error común: si algo falla al pintar, el resto de la app sigue en pie y se puede reintentar. */
export function RouteError({ where, error, reset }: { where: string; error: Error & { digest?: string }; reset: () => void }) {
  // Un fallo de carga de fichero (p. ej. justo tras actualizar la app) se arregla recargando la página entera.
  const stale = error.name === "ChunkLoadError" || /Loading chunk|Failed to load chunk|dynamically imported module/i.test(error.message);
  return (
    <div role="alert" className="grid gap-3 rounded-md border p-4 text-sm">
      <p className="font-medium">{where} no se ha podido mostrar.</p>
      <p className="text-muted-foreground">
        {stale ? "La app se ha actualizado: recarga la página." : "Tus datos no se han tocado. Inténtalo de nuevo; si sigue igual, cuéntalo con este código:"}{" "}
        {stale ? null : <code className="text-xs">{error.digest ?? error.name}</code>}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => (stale ? window.location.reload() : reset())}>
          {stale ? "Recargar" : "Reintentar"}
        </Button>
      </div>
    </div>
  );
}
