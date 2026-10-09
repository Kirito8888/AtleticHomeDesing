"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/client-api";
import { formatNum } from "@/lib/format";

/** Agua del día con un toque (+250 / +500 ml). */
export function WaterCard({ date, ml, target, hot, hasSession, maxTemp }: { date: string; ml: number; target: number; hot: boolean; hasSession: boolean; maxTemp: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function call(init: { method?: string; body?: unknown }, url = "/api/nutrition/water") {
    setBusy(true);
    try {
      await api(url, init);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Agua" className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">💧 Agua</span>
        <span className="tabular-nums">
          {formatNum(ml / 1000, 2)} / {formatNum(target / 1000, 2)} L
        </span>
      </div>
      <Progress value={(ml / target) * 100} aria-label="Agua" />
      <p className="text-xs text-muted-foreground">
        {[hasSession ? "día con sesión" : null, hot ? `calor (${Math.round(maxTemp ?? 0)} °C)` : null].filter(Boolean).join(" · ") || "objetivo base"}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call({ body: { date, ml: 250 } })}>
          +250 ml
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => call({ body: { date, ml: 500 } })}>
          +500 ml
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy || !ml} onClick={() => call({ method: "DELETE" }, `/api/nutrition/water?date=${date}`)}>
          Deshacer
        </Button>
      </div>
    </section>
  );
}
