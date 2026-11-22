"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Watch } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { PendingView } from "@/lib/apple-fitness/inbox-service";
import { api } from "@/lib/client-api";
import { formatDate, formatNum, SESSION_TYPE_LABEL } from "@/lib/format";

type Action = { action: "merge"; sessionId: string } | { action: "import" } | { action: "discard" };

const cell = (v: number | null, unit: string) => (v == null ? "—" : `${unit === "km" ? formatNum(v, 2) : Math.round(v)} ${unit}`);

/** v3.1 · Bandeja de entrenos del reloj: borrador → comparar con lo del día → completar, crear aparte o descartar. */
export function AppleInbox({ items }: { items: PendingView[] }) {
  if (!items.length) return null;
  return (
    <Card className="mb-4 gap-3 py-4" data-testid="apple-inbox">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Watch className="size-4" aria-hidden /> Entrenos del reloj por revisar
          <Badge variant="secondary" data-testid="apple-count">
            {items.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {items.map((w) => (
          <PendingCard key={w.id} w={w} />
        ))}
      </CardContent>
    </Card>
  );
}

function PendingCard({ w }: { w: PendingView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(w.sessions[0]?.id ?? "");
  const chosen = w.sessions.find((s) => s.id === sel) ?? null;

  async function run(a: Action, ok: string) {
    setBusy(true);
    try {
      await api(`/api/training/apple-fitness/pending/${w.id}`, { body: a });
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  const fills = chosen?.rows.filter((r) => r.willFill) ?? [];
  return (
    <section aria-label={`${w.activityName}, ${formatDate(w.date)}`} className="grid gap-2 rounded-md border p-3 text-sm" data-testid="apple-item">
      <p className="font-medium">
        {w.activityName} · {formatDate(w.date)}
      </p>
      {w.sessions.length ? (
        <>
          {w.sessions.length > 1 ? (
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Comparar con</span>
              <Select value={sel} onChange={(e) => setSel(e.target.value)} className="min-h-11" data-testid="apple-session-select">
                {w.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || SESSION_TYPE_LABEL[s.type]}
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">Ya tienes ese día: «{chosen?.title || (chosen && SESSION_TYPE_LABEL[chosen.type])}»</p>
          )}
          {chosen ? (
            <table className="w-full text-left text-xs" data-testid="apple-compare">
              <caption className="sr-only">Comparativa entre la sesión registrada en Atlenza y el reloj</caption>
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="py-1 pr-2 font-normal">
                    <span className="sr-only">Dato</span>
                  </th>
                  <th scope="col" className="py-1 pr-2 font-normal">
                    Web
                  </th>
                  <th scope="col" className="py-1 font-normal">
                    Reloj
                  </th>
                </tr>
              </thead>
              <tbody>
                {chosen.rows.map((r) => (
                  <tr key={r.field} className="border-t" data-testid={`apple-row-${r.field}`}>
                    <th scope="row" className="py-1.5 pr-2 font-normal">
                      {r.label}
                    </th>
                    <td className="py-1.5 pr-2">{cell(r.web, r.unit)}</td>
                    <td className="py-1.5">
                      {cell(r.watch, r.unit)}
                      {r.willFill ? <span className="ml-1 font-medium text-primary">· se completa</span> : r.differs ? <span className="ml-1 text-muted-foreground">· difiere</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {fills.length ? `Completar rellena solo lo que falta (${fills.map((r) => r.label.toLowerCase()).join(", ")}); no cambia lo que escribiste.` : "No falta ningún dato en esa sesión: completar solo la marcará como hecha si estaba planificada."}
          </p>
        </>
      ) : (
        <table className="w-full text-left text-xs" data-testid="apple-solo">
          <tbody>
            <tr>
              <th scope="row" className="py-1 pr-2 font-normal">Reloj</th>
              <td>
                {cell(w.watch.durationSec / 60, "min")} · {cell(w.watch.distanceM == null ? null : w.watch.distanceM / 1000, "km")} · FC {w.watch.hrAvg ?? "—"}/{w.watch.hrMax ?? "—"} · {cell(w.watch.kcal, "kcal")}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap gap-2">
        {chosen ? (
          <Button type="button" size="sm" className="min-h-11" disabled={busy} data-testid="apple-merge" onClick={() => run({ action: "merge", sessionId: chosen.id }, "Sesión completada con los datos del reloj")}>
            Completar esta sesión
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" className="min-h-11" disabled={busy} data-testid="apple-import" onClick={() => run({ action: "import" }, "Creada como sesión aparte (solo la ves tú)")}>
          Crear aparte
        </Button>
        <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={busy} data-testid="apple-discard" onClick={() => run({ action: "discard" }, "Descartado")}>
          Descartar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">«Crear aparte» no se comparte con tu entrenador/a ni con la IA (como Strava).</p>
    </section>
  );
}
