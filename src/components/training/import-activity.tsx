"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/client-api";
import { formatDate, formatDuration, formatNum, formatPace } from "@/lib/format";

interface Preview {
  summary: {
    format: string;
    device: string | null;
    sport: string | null;
    date: string;
    elapsedSec: number;
    movingSec: number;
    distanceM: number | null;
    hrAvg: number | null;
    hrMax: number | null;
    elevationGainM: number | null;
  };
  payload: { title?: string | null };
  duplicateOf: string | null;
}

/** Importar una actividad del reloj (.fit, .gpx, .tcx): vista previa y guardar. */
export function ImportActivity() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (save: boolean) => {
    const file = input.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    setBusy(true);
    try {
      if (!save) {
        setPreview(await api<Preview>("/api/training/import", { form }));
      } else {
        const s = await api<{ id: string; tss: number | null }>("/api/training/import?save=1", { form });
        toast.success(`Actividad importada${s.tss != null ? ` · ${formatNum(s.tss)} TSS` : ""}`);
        router.push(`/training/${s.id}`);
        router.refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
      if (!save) setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const s = preview?.summary;
  return (
    <details className="mb-4 rounded-lg border p-3 text-sm" open={Boolean(preview)}>
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <FileUp className="size-4" /> Importar del reloj (FIT, GPX, TCX)
      </summary>
      <div className="mt-3 grid gap-3">
        <input
          ref={input}
          type="file"
          accept=".fit,.gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml"
          aria-label="Fichero de actividad"
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
          onChange={() => void send(false)}
        />
        {s ? (
          <div className="grid gap-2 rounded-md bg-muted/50 p-3" aria-label="Vista previa de la actividad">
            <p className="font-medium">
              {preview!.payload.title} · {formatDate(s.date, { weekday: "short", day: "numeric", month: "short" })}
            </p>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Distancia</dt>
                <dd className="font-semibold tabular-nums">{s.distanceM ? `${formatNum(s.distanceM / 1000, 2)} km` : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">En movimiento</dt>
                <dd className="font-semibold tabular-nums">{formatDuration(s.movingSec)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ritmo</dt>
                <dd className="font-semibold tabular-nums">{s.distanceM ? formatPace(s.movingSec / (s.distanceM / 1000)) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">FC media</dt>
                <dd className="font-semibold tabular-nums">{s.hrAvg ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">FC máx.</dt>
                <dd className="font-semibold tabular-nums">{s.hrMax ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Desnivel +</dt>
                <dd className="font-semibold tabular-nums">{s.elevationGainM != null ? `${formatNum(s.elevationGainM)} m` : "—"}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {s.format}
              {s.device ? ` · ${s.device}` : ""}
              {s.sport ? ` · ${s.sport}` : ""}
            </p>
            {preview!.duplicateOf ? (
              <p className="text-xs text-destructive">Esta actividad ya está importada.</p>
            ) : (
              <Button type="button" disabled={busy} onClick={() => void send(true)}>
                Guardar como sesión
              </Button>
            )}
          </div>
        ) : busy ? (
          <p className="text-muted-foreground">Leyendo…</p>
        ) : null}
      </div>
    </details>
  );
}
