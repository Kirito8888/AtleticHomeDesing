"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Entrada numérica con botones −/+ grandes (gimnasio: manos ocupadas, una mano).
 * El campo central acepta escritura directa con teclado decimal.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  decimals = 0,
  label,
  suffix,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  label: string;
  suffix?: string;
  className?: string;
}) {
  const stepText = String(step).replace(".", ",");
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10 ** decimals) / 10 ** decimals));
  return (
    <div className={cn("flex items-center rounded-md border", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10 shrink-0 rounded-r-none"
        aria-label={`Restar ${stepText} a ${label}`}
        onClick={() => onChange(clamp((value ?? 0) - step))}
      >
        <Minus />
      </Button>
      <div className="relative min-w-0 flex-1">
        <input
          aria-label={label}
          inputMode={decimals ? "decimal" : "numeric"}
          className={cn("h-10 w-full min-w-0 bg-transparent text-center text-base font-semibold tabular-nums outline-none", suffix && "pr-7 pl-1")}
          value={value == null ? "" : String(value).replace(".", ",")}
          onChange={(e) => {
            const raw = e.target.value.replace(",", ".");
            if (raw === "") return onChange(null);
            const n = Number(raw);
            if (!Number.isNaN(n)) onChange(n);
          }}
          onBlur={() => value != null && onChange(clamp(value))}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-[10px] text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-10 shrink-0 rounded-l-none"
        aria-label={`Sumar ${stepText} a ${label}`}
        onClick={() => onChange(clamp((value ?? 0) + step))}
      >
        <Plus />
      </Button>
    </div>
  );
}
