import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de los `loading.tsx`: se ve al instante al tocar un enlace mientras llega la página.
 * Sin anchos fijos para no desbordar a 390 px.
 */
export function PageSkeleton({ variant = "list" }: { variant?: "list" | "cards" }) {
  return (
    <div role="status" aria-busy="true" className="grid gap-4">
      <span className="sr-only">Cargando…</span>
      <Skeleton className="h-7 w-1/2 max-w-64" />
      <Skeleton className="h-4 w-3/4 max-w-96" />
      {variant === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
