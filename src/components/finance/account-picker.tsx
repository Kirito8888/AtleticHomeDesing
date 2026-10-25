"use client";

import { formatEur } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PickerAccount {
  id: string;
  name: string;
  type: string;
  balanceCents?: number;
}

/** Cuenta inicial: la recordada si sigue activa; si no, la primera. Con una sola cuenta, esa. */
export function pickAccount(money: ReadonlyArray<{ id: string }>, remembered: string | null | undefined): string | null {
  if (remembered && money.some((a) => a.id === remembered)) return remembered;
  return money[0]?.id ?? null;
}

/** Cuenta o tarjeta de un toque (radiogroup accesible, 44 px). Envía el valor como `name` en un campo oculto. */
export function AccountPicker({
  accounts,
  value,
  onChange,
  label,
  name = "account",
}: {
  accounts: PickerAccount[];
  value: string | null;
  onChange: (id: string) => void;
  label: string;
  name?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <span id={`${name}-label`} className="text-sm font-medium">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${name}-label`} className="grid grid-cols-2 gap-2">
        {accounts.map((a) => {
          const active = a.id === value;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(a.id)}
              className={cn(
                "grid min-h-11 min-w-0 content-center rounded-md border px-3 py-1.5 text-left text-sm transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              )}
            >
              <span className="truncate font-medium">
                {a.name}
                {a.type === "LIABILITY" ? " · tarjeta" : ""}
              </span>
              {a.balanceCents != null ? (
                <span className={cn("truncate text-xs tabular-nums", active ? "text-primary-foreground/80" : "text-muted-foreground")}>{formatEur(a.balanceCents)}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <input type="hidden" name={name} value={value ?? ""} />
    </div>
  );
}
