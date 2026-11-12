"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import type { AccountOpt, CategoryOpt } from "@/components/finance/finance-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/client-api";
import { linesImbalance } from "@/lib/finance/edit-lines";
import { toCents } from "@/lib/finance/ledger";
import { formatEur } from "@/lib/format";

export interface EditableLine {
  id: string;
  accountId: string;
  amountCents: number;
  categoryId: string | null;
  memo: string | null;
}
interface Base {
  id: string;
  date: string;
  description: string;
  sport: boolean;
  eventId: string | null;
  lines: EditableLine[];
}

// Valor de un <input>: coma decimal y sin separador de miles, como lo escribe la persona.
// eslint-disable-next-line no-restricted-syntax
const toText = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const parse = (v: string): number | null => {
  try {
    return v.trim() ? toCents(v) : null;
  } catch {
    return null;
  }
};

function useSave(tx: Base, close: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const save = async (description: string, date: string, lines: EditableLine[]) => {
    setBusy(true);
    try {
      await api(`/api/finance/transactions/${tx.id}`, {
        method: "PUT",
        body: { mode: "lines", date, description, lines, sport: tx.sport, eventId: tx.eventId },
      });
      toast.success("Movimiento actualizado");
      close();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

const Trigger = () => (
  <SheetTrigger asChild>
    <button type="button" className="min-h-11 px-3 text-xs text-muted-foreground hover:underline">
      Editar
    </button>
  </SheetTrigger>
);

/** Transferencia: importe, cuenta de origen y de destino, nota, concepto y fecha. */
export function EditTransfer({ tx, accounts }: { tx: Base; accounts: AccountOpt[] }) {
  const [open, setOpen] = useState(false);
  const { busy, save } = useSave(tx, () => setOpen(false));
  const money = accounts.filter((a) => (a.type === "ASSET" || a.type === "LIABILITY") && !a.isArchived);
  const out = tx.lines.find((l) => l.amountCents < 0) ?? tx.lines[0];
  const inn = tx.lines.find((l) => l !== out) ?? tx.lines[1];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Trigger />
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Editar transferencia</SheetTitle>
          <SheetDescription>Los saldos de las dos cuentas se recalculan al guardar.</SheetDescription>
        </SheetHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const amount = parse(String(f.get("amount") ?? ""));
            if (!amount || amount <= 0) return toast.error("Importe no válido");
            const from = String(f.get("from"));
            const to = String(f.get("to"));
            if (from === to) return toast.error("Las cuentas deben ser distintas");
            const memo = String(f.get("memo") ?? "").trim() || null;
            void save(String(f.get("description") ?? ""), String(f.get("date")), [
              { ...out, accountId: from, amountCents: -amount, memo },
              { ...inn, accountId: to, amountCents: amount, memo },
            ]);
          }}
        >
          <Field label="Importe (€)" htmlFor={`t-amount-${tx.id}`}>
            <Input id={`t-amount-${tx.id}`} name="amount" inputMode="decimal" defaultValue={toText(Math.abs(inn.amountCents))} className="h-12 text-xl font-semibold" required />
          </Field>
          <Field label="Desde" htmlFor={`t-from-${tx.id}`}>
            <Select id={`t-from-${tx.id}`} name="from" defaultValue={out.accountId}>
              {money.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Hacia" htmlFor={`t-to-${tx.id}`}>
            <Select id={`t-to-${tx.id}`} name="to" defaultValue={inn.accountId}>
              {money.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Concepto" htmlFor={`t-desc-${tx.id}`}>
            <Input id={`t-desc-${tx.id}`} name="description" defaultValue={tx.description} required />
          </Field>
          <Field label="Nota" htmlFor={`t-memo-${tx.id}`}>
            <Input id={`t-memo-${tx.id}`} name="memo" defaultValue={out.memo ?? ""} maxLength={200} />
          </Field>
          <Field label="Fecha" htmlFor={`t-date-${tx.id}`}>
            <Input id={`t-date-${tx.id}`} name="date" type="date" defaultValue={tx.date} required />
          </Field>
          <Button type="submit" size="lg" disabled={busy}>
            Guardar cambios
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Asiento partido: cada línea con su cuenta, importe con signo (+ débito / − crédito), categoría y nota; debe cuadrar. */
export function EditSplit({ tx, accounts, categories }: { tx: Base; accounts: AccountOpt[]; categories: CategoryOpt[] }) {
  const [open, setOpen] = useState(false);
  const { busy, save } = useSave(tx, () => setOpen(false));
  const [rows, setRows] = useState(() => tx.lines.map((l) => ({ ...l, text: toText(l.amountCents) })));
  const [description, setDescription] = useState(tx.description);
  const [date, setDate] = useState(tx.date);
  const parsed = rows.map((r) => parse(r.text));
  const invalid = parsed.some((p) => p === null || p === 0);
  const imbalance = linesImbalance(parsed.map((p) => ({ amountCents: p ?? 0 })));
  const patch = (i: number, p: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setRows(tx.lines.map((l) => ({ ...l, text: toText(l.amountCents) })));
          setDescription(tx.description);
          setDate(tx.date);
        }
      }}
    >
      <Trigger />
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar asiento</SheetTitle>
          <SheetDescription>Las líneas deben sumar 0: lo que entra es lo que sale. No se pueden añadir ni quitar líneas.</SheetDescription>
        </SheetHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (invalid || imbalance !== 0) return;
            void save(
              description,
              date,
              rows.map((r, i) => ({ id: r.id, accountId: r.accountId, amountCents: parsed[i]!, categoryId: r.categoryId || null, memo: r.memo?.trim() || null })),
            );
          }}
        >
          <Field label="Concepto" htmlFor={`s-desc-${tx.id}`}>
            <Input id={`s-desc-${tx.id}`} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </Field>
          <Field label="Fecha" htmlFor={`s-date-${tx.id}`}>
            <Input id={`s-date-${tx.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          {rows.map((r, i) => (
            <fieldset key={r.id} className="grid gap-2 rounded-md border p-2">
              <legend className="px-1 text-xs text-muted-foreground">Línea {i + 1}</legend>
              <Select aria-label={`Cuenta de la línea ${i + 1}`} value={r.accountId} onChange={(e) => patch(i, { accountId: e.target.value })}>
                {accounts
                  .filter((a) => !a.isArchived || a.id === r.accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
              <Input aria-label={`Importe de la línea ${i + 1} (€, con signo)`} inputMode="decimal" value={r.text} onChange={(e) => patch(i, { text: e.target.value })} className="h-11" />
              <Select aria-label={`Categoría de la línea ${i + 1}`} value={r.categoryId ?? ""} onChange={(e) => patch(i, { categoryId: e.target.value || null })}>
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Input aria-label={`Nota de la línea ${i + 1}`} placeholder="Nota" value={r.memo ?? ""} maxLength={200} onChange={(e) => patch(i, { memo: e.target.value })} className="h-11" />
            </fieldset>
          ))}
          <p role="status" className={imbalance === 0 && !invalid ? "text-sm text-emerald-700 dark:text-emerald-400" : "text-sm text-destructive"}>
            {invalid ? "Revisa los importes: ninguno puede estar vacío ni ser 0" : imbalance === 0 ? "Cuadra" : `Descuadre: ${formatEur(imbalance)}`}
          </p>
          <Button type="submit" size="lg" disabled={busy || invalid || imbalance !== 0}>
            Guardar cambios
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
