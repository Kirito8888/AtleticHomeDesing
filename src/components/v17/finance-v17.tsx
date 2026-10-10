"use client";

import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { SEASON_LINES, type SeasonLine } from "@/lib/finance/v17-finance";
import { formatEur } from "@/lib/format";

const toCents = (s: string) => Math.round(Number(s.replace(",", ".") || 0) * 100);
const toEur = (c: number | undefined) => (c ? String(c / 100).replace(".", ",") : "");

/** 25 · Presupuesto de la temporada: por concepto y coste medio por competición. */
export function SeasonBudgetForm({ season, lines, perCompetitionCents }: { season: number; lines: Partial<Record<SeasonLine, number>>; perCompetitionCents: number }) {
  const router = useRouter();
  const keys = Object.keys(SEASON_LINES) as SeasonLine[];
  const [v, setV] = useState<Record<string, string>>({ ...Object.fromEntries(keys.map((k) => [k, toEur(lines[k])])), perComp: toEur(perCompetitionCents) });
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="grid gap-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/finance/season-budget", { method: "PUT", body: { season, lines: Object.fromEntries(keys.map((k) => [k, toCents(v[k])])), perCompetitionCents: toCents(v.perComp) } });
          toast.success("Presupuesto guardado");
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {keys.map((k) => (
          <Field key={k} label={`${SEASON_LINES[k]} (€)`} htmlFor={`sb-${k}`}>
            <Input id={`sb-${k}`} inputMode="decimal" className="w-full min-w-0" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </Field>
        ))}
      </div>
      <Field label="Coste medio por competición (€)" htmlFor="sb-percomp" hint="Viaje, inscripción, comidas… Sirve para prever lo que queda">
        <Input id="sb-percomp" inputMode="decimal" className="w-32" value={v.perComp} onChange={(e) => setV({ ...v, perComp: e.target.value })} />
      </Field>
      <Button type="submit" variant="outline" disabled={busy}>
        Guardar presupuesto {season}
      </Button>
    </form>
  );
}

/** 26 · Justificantes de un movimiento: adjuntar (cifrado) y abrir. */
export function Receipts({ transactionId, receipts }: { transactionId: string; receipts: Array<{ id: string; mime: string }> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="flex shrink-0 items-center gap-1">
      {receipts.map((r, i) => (
        <a key={r.id} href={`/api/finance/receipts/${r.id}`} target="_blank" rel="noopener" className="text-xs underline underline-offset-2" aria-label={`Justificante ${i + 1}`}>
          {r.mime === "application/pdf" ? "PDF" : "Foto"}
        </a>
      ))}
      <label className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Adjuntar justificante" title="Adjuntar justificante">
        <Paperclip className="size-4" aria-hidden />
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Adjuntar justificante"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            try {
              const form = new FormData();
              form.set("file", f);
              await api(`/api/finance/transactions/${transactionId}/receipts`, { form });
              toast.success("Justificante guardado (cifrado)");
              router.refresh();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
              if (input.current) input.current.value = "";
            }
          }}
        />
      </label>
    </span>
  );
}

/** 27 · Avisos de subida de precio y cambiar el importe guardado. */
export function PriceAlerts({ charged, edited }: { charged: Array<{ subscriptionId: string; name: string; storedCents: number; chargedCents: number; date: string; pct: number }>; edited: Array<{ id: string; name: string; fromCents: number; toCents: number; pct: number }> }) {
  const router = useRouter();
  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  if (!charged.length && !edited.length) return null;
  return (
    <ul className="mb-3 grid gap-2" aria-label="Subidas de precio">
      {charged.map((c) => (
        <li key={c.subscriptionId} role="status" className="grid gap-1 rounded-md border border-amber-500/50 bg-amber-500/5 p-2 text-xs">
          <span>
            <span className="font-medium">{c.name}</span>: el último cargo ({c.date}) fue de {formatEur(c.chargedCents)} y tenías {formatEur(c.storedCents)} (+{String(c.pct).replace(".", ",")} %).
          </span>
          <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => run(() => api(`/api/finance/subscriptions/${c.subscriptionId}`, { method: "PATCH", body: { amountCents: c.chargedCents } }), "Importe actualizado")}>
            Actualizar a {formatEur(c.chargedCents)}
          </Button>
        </li>
      ))}
      {edited.map((c) => (
        <li key={c.id} role="status" className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
          <span>
            <span className="font-medium">{c.name}</span> subió de {formatEur(c.fromCents)} a {formatEur(c.toCents)} (+{String(c.pct).replace(".", ",")} %).
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={() => run(() => api(`/api/finance/price-changes/${c.id}`, { method: "POST" }), "Aviso cerrado")}>
            Entendido
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function SubscriptionAmount({ id, name, amountCents }: { id: string; name: string; amountCents: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(toEur(amountCents));
  if (!open)
    return (
      <button type="button" className="text-xs underline underline-offset-2" onClick={() => setOpen(true)}>
        Cambiar importe
      </button>
    );
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api(`/api/finance/subscriptions/${id}`, { method: "PATCH", body: { amountCents: toCents(v) } });
          setOpen(false);
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
    >
      <Input aria-label={`Nuevo importe de ${name}`} inputMode="decimal" className="h-7 w-20" value={v} onChange={(e) => setV(e.target.value)} />
      <Button type="submit" size="sm" variant="outline">
        OK
      </Button>
    </form>
  );
}
