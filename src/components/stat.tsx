import { cn } from "@/lib/utils";

/** Stat tile: etiqueta, valor y contexto. Cifras con tabular-nums. */
export function Stat({
  label,
  value,
  unit,
  hint,
  swatch,
  why,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  /** Variable CSS del color de la serie que representa (identidad, no texto). */
  swatch?: string;
  /** v3.2 I · de dónde sale el número (plegado bajo «¿Por qué?»). */
  why?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {swatch ? <span className="inline-block size-2.5 rounded-full" style={{ background: `var(${swatch})` }} aria-hidden /> : null}
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">
        {value}
        {unit ? <span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span> : null}
      </div>
      {why ? (
        <details className="text-xs text-muted-foreground">
          <summary className="flex min-h-11 cursor-pointer items-center underline underline-offset-2">¿Por qué?</summary>
          <p data-testid="stat-why" className="pb-2">{why}</p>
        </details>
      ) : null}
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
