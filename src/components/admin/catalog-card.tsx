"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";

type State = { brand: string; page: number; total: number | null; products: number; finishedAt: string | null; error: string | null };

/** v1.10 · Catálogo de alimentos sincronizado con OpenFoodFacts (marcas españolas). */
export function CatalogCard({ enabled, total, states, brands }: { enabled: boolean; total: number; states: State[]; brands: string[] }) {
  const router = useRouter();
  const byBrand = new Map(states.map((s) => [s.brand, s]));
  return (
    <div className="grid gap-3 text-sm">
      <p>
        {total.toLocaleString("es-ES")} productos en el catálogo local. {enabled ? "Se actualiza solo cada semana, sin pasar de 10 búsquedas por minuto en OpenFoodFacts." : "Sincronización desactivada (OFF_SYNC_ENABLED=false)."}
      </p>
      <ul className="grid gap-1 text-xs" aria-label="Marcas del catálogo">
        {brands.map((b) => {
          const s = byBrand.get(b);
          return (
            <li key={b} className="flex justify-between gap-2">
              <span className="capitalize">{b.replace(/-/g, " ")}</span>
              <span className="tabular-nums text-muted-foreground">
                {!s ? "pendiente" : s.error ? `error: ${s.error}` : s.finishedAt ? `${s.products} · al día (${new Date(s.finishedAt).toLocaleDateString("es-ES")})` : `${s.products} de ${s.total ?? "?"} · en curso`}
              </span>
            </li>
          );
        })}
      </ul>
      {enabled ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={async () => {
            try {
              await api("/api/admin/catalog-sync", { method: "POST" });
              toast.success("Sincronizando en segundo plano; recarga en un minuto");
              setTimeout(() => router.refresh(), 60_000);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Sincronizar ahora
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">Datos de Open Food Facts (licencia ODbL), aportados por su comunidad. No se copia nada de las webs de los supermercados.</p>
    </div>
  );
}
