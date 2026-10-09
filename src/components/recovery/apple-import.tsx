"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { appleDays, type DayAgg, feedApple, newAppleState } from "@/lib/recovery/apple-health";

/**
 * Apple Health: el export.xml (puede pesar cientos de MB) se lee aquí, en el móvil u ordenador,
 * y solo se envía el total de cada día. Health Connect/otras apps: usa el CSV de arriba.
 */
export function AppleImport() {
  const router = useRouter();
  const [days, setDays] = useState<DayAgg[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(file: File) {
    const st = newAppleState();
    const from = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
    let read = 0;
    setProgress(0);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      read += value.length;
      feedApple(st, value, from);
      setProgress(Math.min(99, Math.round((read / file.size) * 100)));
    }
    setProgress(null);
    const d = appleDays(st);
    setDays(d);
    if (!d.length) toast.error("No hay sueño ni FC en reposo del último año en ese fichero");
  }

  async function save() {
    if (!days?.length) return;
    setBusy(true);
    try {
      const r = await api<{ imported: number }>("/api/recovery/import/days", { body: { days } });
      toast.success(`${r.imported} días importados`);
      setDays(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 text-sm">
      <label className="grid gap-1">
        <span className="font-medium">Apple Health (export.xml)</span>
        <Input type="file" accept=".xml,text/xml" aria-label="Fichero export.xml de Apple Health" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
      </label>
      <p className="text-xs text-muted-foreground">
        En el iPhone: Salud → tu foto → Exportar todos los datos, y descomprime el .zip. Se lee aquí: solo se envía el sueño y la FC en reposo de cada día del último año. La VFC de Apple
        (SDNN) no se importa porque no es comparable con la rMSSD.
      </p>
      {progress != null ? <p role="status">Leyendo… {progress} %</p> : null}
      {days?.length ? (
        <div className="grid gap-2 rounded-md border p-2" aria-label="Vista previa de Apple Health">
          <p>
            {days.length} días · último: {days.at(-1)!.date} · {(days.at(-1)!.sleepMin / 60).toFixed(1).replace(".", ",")} h de sueño
            {days.at(-1)!.restingHr ? ` · ${days.at(-1)!.restingHr} lpm` : ""}
          </p>
          <Button type="button" size="sm" disabled={busy} onClick={save}>
            Importar {days.length} días
          </Button>
        </div>
      ) : null}
    </div>
  );
}
