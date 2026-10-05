"use client";

import { cn } from "@/lib/utils";

/** Selección única con chips táctiles (radiogroup accesible). */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
  allowDeselect = false,
  className,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange: (v: T | null) => void;
  label: string;
  allowDeselect?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(active && allowDeselect ? null : o.value)}
            className={cn(
              "h-9 min-w-10 rounded-full border px-3 text-sm font-medium tabular-nums transition-colors",
              active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
