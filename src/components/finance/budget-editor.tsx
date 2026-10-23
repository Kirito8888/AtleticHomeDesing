"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/client-api";
import { toCents } from "@/lib/finance/ledger";
import { formatMonth } from "@/lib/format";

export interface BudgetEditorProps {
  month: string;
  categories: Array<{ id: string; name: string }>;
  /** Categoría fija (editar o fijar desde una fila); sin ella se puede elegir. */
  categoryId?: string;
  budgetId?: string;
  amountCents?: number;
  alertThresholdPct?: number;
  label: string;
  variant?: "outline" | "default" | "ghost";
}

/** Fija, edita o quita el presupuesto mensual de una categoría desde el mes elegido. */
export function BudgetEditor({ month, categories, categoryId, budgetId, amountCents, alertThresholdPct, label, variant = "outline" }: BudgetEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = categoryId ?? "new";
  // Valor de un <input>: coma decimal y sin separador de miles, como lo escribe la persona.
  // eslint-disable-next-line no-restricted-syntax
  const amountText = amountCents ? (amountCents / 100).toFixed(2).replace(".", ",") : "";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant={variant} size="sm" className="min-h-11 shrink-0">
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Presupuesto mensual</SheetTitle>
          <SheetDescription>Vale desde {formatMonth(month, "long")}; los meses anteriores no cambian.</SheetDescription>
        </SheetHeader>
        <form
          className="grid gap-3 px-4 pb-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            let cents: number;
            try {
              cents = toCents(String(f.get("amount") ?? ""));
            } catch {
              return toast.error("Importe no válido");
            }
            if (cents <= 0) return toast.error("El importe debe ser mayor que 0");
            const alert = Number(f.get("alert") ?? 80);
            if (!Number.isInteger(alert) || alert < 1 || alert > 100) return toast.error("El aviso va de 1 a 100 %");
            setBusy(true);
            try {
              await api("/api/finance/budgets", {
                method: "PUT",
                body: { categoryId: categoryId ?? String(f.get("category")), amountCents: cents, alertThresholdPct: alert, month },
              });
              toast.success("Presupuesto guardado");
              setOpen(false);
              router.refresh();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {categoryId ? null : (
            <Field label="Categoría" htmlFor={`b-cat-${key}`}>
              <Select id={`b-cat-${key}`} name="category" required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Límite al mes (€)" htmlFor={`b-amount-${key}`}>
            <Input id={`b-amount-${key}`} name="amount" inputMode="decimal" defaultValue={amountText} className="h-12 text-xl font-semibold" required />
          </Field>
          <Field label="Avisar al llegar al (%)" htmlFor={`b-alert-${key}`}>
            <Input id={`b-alert-${key}`} name="alert" inputMode="numeric" defaultValue={alertThresholdPct ?? 80} className="h-11" required />
          </Field>
          <Button type="submit" size="lg" disabled={busy}>
            Guardar presupuesto
          </Button>
          {budgetId ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={busy}
              onClick={async () => {
                if (!(await confirmDialog({ title: "¿Quitar este presupuesto?", description: `Dejará de aplicarse desde ${formatMonth(month, "long")}. Los meses anteriores se conservan.`, confirmLabel: "Quitar", destructive: true }))) return;
                setBusy(true);
                try {
                  await api(`/api/finance/budgets/${budgetId}?month=${month}`, { method: "DELETE" });
                  toast.success("Presupuesto quitado");
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Quitar presupuesto
            </Button>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  );
}
