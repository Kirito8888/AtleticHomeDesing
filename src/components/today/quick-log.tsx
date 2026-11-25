"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dumbbell, Droplets, Wallet } from "lucide-react";
import { toast } from "sonner";

import { QuickTransaction } from "@/components/finance/finance-forms";
import { AddFoodSheet } from "@/components/nutrition/add-food-sheet";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { sendOrQueue } from "@/lib/offline/outbox";
import type { FinanceOverview } from "@/lib/finance/overview";

const BIG = "h-12 w-full justify-center gap-2";

/** v3.0 H · Registro en 1–2 toques desde «Hoy». Gasto y agua no cargan nada en el render: piden sus datos al tocar. */
export function QuickLog({ day, hidden, setHref }: { day: string; hidden: readonly string[]; setHref: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fin, setFin] = useState<FinanceOverview | null>(null);
  const [seq, setSeq] = useState(0);
  const off = (m: string) => hidden.includes(m);

  async function water() {
    setBusy(true);
    try {
      const r = await sendOrQueue("/api/nutrition/water", { date: day, ml: 250 }, "Agua +250 ml", "POST", { idempotent: true });
      toast.success(r === "queued" ? "Sin conexión: el agua se apuntará al volver la cobertura" : "Agua +250 ml apuntada");
      if (r === "sent") router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openExpense() {
    setBusy(true);
    try {
      setFin(await api<FinanceOverview>("/api/finance/overview"));
      setSeq((n) => n + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Registrar" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {off("training") ? null : (
        <Button asChild variant="outline" className={BIG}>
          <Link href={setHref}>
            <Dumbbell /> Serie
          </Link>
        </Button>
      )}
      {off("nutrition") ? null : <AddFoodSheet date={day} triggerLabel="Toma" triggerClassName={`${BIG} border bg-background text-foreground shadow-xs hover:bg-accent`} />}
      {off("nutrition") ? null : (
        <Button type="button" variant="outline" className={BIG} disabled={busy} onClick={() => void water()}>
          <Droplets /> Agua +250
        </Button>
      )}
      {off("finance") ? null : (
        <>
          <Button type="button" variant="outline" className={BIG} disabled={busy} onClick={() => void openExpense()}>
            <Wallet /> Gasto
          </Button>
          {fin ? (
            <QuickTransaction key={seq} defaultOpen hideTrigger accounts={fin.accounts} categories={fin.categories} frequent={fin.frequent} today={day} />
          ) : null}
        </>
      )}
    </section>
  );
}
