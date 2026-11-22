"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HeartPulse } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/client-api";
import { formatDate, formatNum } from "@/lib/format";
import { METRIC_LABEL, METRIC_UNIT } from "@/lib/recovery/health-sync";

export type ConflictView = { id: string; date: string; metric: string; currentValue: number; incomingValue: number };

const show = (metric: string, v: number) => `${metric === "RESTING_HR" || metric === "HRV_SDNN" ? Math.round(v) : formatNum(v, metric === "BODY_WEIGHT" ? 1 : 2)} ${METRIC_UNIT[metric]}`;

/** v3.1 B · Valores de Apple Salud distintos de lo que anotaste: no se pisa nada, eliges con cuál quedarte. */
export function HealthConflicts({ items }: { items: ConflictView[] }) {
  if (!items.length) return null;
  return (
    <Card className="mb-4 gap-3 py-4" data-testid="health-conflicts">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HeartPulse className="size-4" aria-hidden /> Apple Salud difiere de lo que anotaste
          <Badge variant="secondary" data-testid="health-conflict-count">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {items.map((c) => (
          <Row key={c.id} c={c} />
        ))}
      </CardContent>
    </Card>
  );
}

function Row({ c }: { c: ConflictView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function pick(keep: "current" | "incoming") {
    setBusy(true);
    try {
      await api(`/api/recovery/apple-health/conflicts/${c.id}`, { body: { keep } });
      toast.success(keep === "incoming" ? "Valor de Apple Salud guardado" : "Te quedas con lo anotado");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2 rounded-md border p-3 text-sm" data-testid="health-conflict">
      <p className="font-medium">
        {METRIC_LABEL[c.metric]} · {formatDate(c.date)}
      </p>
      <p>
        Anotado: <strong>{show(c.metric, c.currentValue)}</strong> · Apple Salud: <strong>{show(c.metric, c.incomingValue)}</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={busy} data-testid="health-keep-current" onClick={() => pick("current")}>
          Quedarme con lo anotado
        </Button>
        <Button type="button" size="sm" className="min-h-11" disabled={busy} data-testid="health-take-incoming" onClick={() => pick("incoming")}>
          Usar el de Apple Salud
        </Button>
      </div>
    </div>
  );
}
