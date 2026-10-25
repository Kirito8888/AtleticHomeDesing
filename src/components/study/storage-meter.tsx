import { formatBytes } from "@/lib/format";
import { quotaPercent } from "@/lib/study/quota";

/** Espacio de apuntes usado frente al límite (v2.5 · Estudio B14). Sirve en servidor y cliente. */
export function StorageMeter({ used, limit }: { used: number; limit: number }) {
  const pct = quotaPercent(used, limit);
  const full = used >= limit;
  const warn = pct >= 90;
  return (
    <section aria-label="Espacio de apuntes" data-testid="storage-meter" className="mb-3 grid gap-1.5 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">Espacio de apuntes</span>
        <span className="text-muted-foreground">
          {formatBytes(used)} de {formatBytes(limit)} · {pct} %
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Espacio de apuntes usado"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${formatBytes(used)} de ${formatBytes(limit)}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={`h-full rounded-full ${warn ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.max(pct, used > 0 ? 1 : 0)}%` }} />
      </div>
      {full ? (
        <p role="status" className="text-xs text-destructive">Has llegado al límite: borra apuntes antiguos para subir más.</p>
      ) : warn ? (
        <p role="status" className="text-xs text-destructive">Te queda poco espacio ({formatBytes(limit - used)}).</p>
      ) : null}
    </section>
  );
}
