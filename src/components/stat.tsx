import { cn } from "@/lib/utils";

/** Stat tile: etiqueta, valor y contexto. Cifras con tabular-nums. */
export function Stat({
  label,
  value,
  unit,
  hint,
  swatch,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  /** Variable CSS del color de la serie que representa (identidad, no texto). */
  swatch?: string;
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
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
