"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { localDay } from "@/lib/dates";
import { formatNum } from "@/lib/format";
import { type AppleWorkout, appleDays, appleWorkouts, type DayAgg, feedApple, newAppleState } from "@/lib/recovery/apple-health";

type Preview = { days: DayAgg[]; workouts: AppleWorkout[]; skipped: number };
type DaysResult = { imported: number; saved: number; unchanged: number; conflicts: number };
type WorkoutsResult = { received: number; added: number; duplicates: number };

const DAYS_PER_REQUEST = 400;
const WORKOUTS_PER_REQUEST = 500;
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

/**
 * Apple Salud y Fitness sin Atajos: el export.xml (puede pesar cientos de MB) se lee aquí, en el móvil u ordenador, y solo se envían
 * los totales de cada día y el resumen de cada entreno. Los entrenos van a la bandeja de borradores (nada entra en el diario sin aceptar)
 * y lo que difiera de lo que anotaste a mano no se pisa: queda como aviso en Recuperación.
 */
export function AppleImport() {
  const router = useRouter();
  const [from, setFrom] = useState(() => localDay(new Date(Date.now() - 30 * 864e5)));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function read(f: File, since: string) {
    setPreview(null);
    setBusy(true);
    try {
      const st = newAppleState();
      const reader = f.stream().pipeThrough(new TextDecoderStream()).getReader();
      let done = 0;
      setProgress(0);
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        done += value.length;
        feedApple(st, value, since);
        setProgress(Math.min(99, Math.round((done / f.size) * 100)));
      }
      const p = { days: appleDays(st), workouts: appleWorkouts(st), skipped: st.skipped };
      setPreview(p);
      if (!p.days.length && !p.workouts.length) toast.error(`No hay sueño, FC en reposo, VFC, peso ni entrenos desde ${since} en ese fichero`);
    } catch {
      toast.error("No se pudo leer el fichero: elige el export.xml de Salud (dentro del .zip)");
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function save() {
    if (!preview) return;
    setBusy(true);
    try {
      const msgs: string[] = [];
      let conflicts = 0;
      if (preview.days.length) {
        let imported = 0;
        for (const part of chunks(preview.days, DAYS_PER_REQUEST)) {
          const body = {
            days: part.map((d) => ({
              date: d.date,
              ...(d.sleepMin > 0 ? { sleepMin: d.sleepMin } : {}),
              ...(d.restingHr != null ? { restingHr: d.restingHr } : {}),
              ...(d.hrvSdnnMs != null ? { hrvSdnnMs: d.hrvSdnnMs } : {}),
              ...(d.weightKg != null ? { weightKg: d.weightKg } : {}),
            })),
          };
          const r = await api<DaysResult>("/api/recovery/import/days", { body });
          imported += r.imported;
          conflicts += r.conflicts;
        }
        msgs.push(`${imported} días importados`);
      }
      if (preview.workouts.length) {
        let added = 0;
        let duplicates = 0;
        for (const part of chunks(preview.workouts, WORKOUTS_PER_REQUEST)) {
          const r = await api<WorkoutsResult>("/api/training/apple-fitness/import", { body: { workouts: part } });
          added += r.added;
          duplicates += r.duplicates;
        }
        msgs.push(`${added} entrenos a la bandeja${duplicates ? ` (${duplicates} ya estaban)` : ""}`);
      }
      if (conflicts) msgs.push(`${conflicts} avisos en Recuperación: lo anotado a mano no se ha pisado`);
      toast.success(msgs.join(" · "));
      setPreview(null);
      setFile(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const last = preview?.days.at(-1);
  const hasData = !!preview && (preview.days.length > 0 || preview.workouts.length > 0);

  return (
    <div className="grid gap-2 text-sm">
      <label className="grid gap-1">
        <span className="font-medium">Apple Salud y Fitness (export.xml)</span>
        <Input
          type="file"
          accept=".xml,text/xml"
          aria-label="Fichero export.xml de Apple Health"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFile(f);
            void read(f, from);
          }}
        />
      </label>
      <label className="grid gap-1">
        <span>Desde</span>
        <Input
          type="date"
          value={from}
          max={localDay(new Date())}
          aria-label="Importar desde"
          className="max-w-44"
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setFrom(v);
            if (file) void read(file, v);
          }}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        En el iPhone: Salud → tu foto → Exportar todos los datos, y descomprime el .zip. Se lee aquí, sin subir el fichero: solo se envían el sueño, la FC en reposo, la VFC (SDNN) y el
        peso de cada día, y el resumen de cada entreno. Los entrenos llegan como borradores en Entreno; si algo difiere de lo que anotaste, verás un aviso en Recuperación.
      </p>
      {progress != null ? <p role="status">Leyendo… {progress} %</p> : null}
      {hasData ? (
        <div className="grid gap-2 rounded-md border p-2" aria-label="Vista previa de Apple Health">
          {preview.days.length && last ? (
            <p>
              {preview.days.length} días · último: {last.date}
              {last.sleepMin ? ` · ${formatNum(last.sleepMin / 60)} h de sueño` : ""}
              {last.restingHr ? ` · ${last.restingHr} lpm` : ""}
              {last.hrvSdnnMs ? ` · VFC ${formatNum(last.hrvSdnnMs)} ms` : ""}
              {last.weightKg ? ` · ${formatNum(last.weightKg)} kg` : ""}
            </p>
          ) : null}
          {preview.workouts.length ? (
            <p>
              {preview.workouts.length} entrenos · último: {preview.workouts.at(-1)!.type} del {preview.workouts.at(-1)!.start.slice(0, 10)}
              {preview.skipped ? ` · ${preview.skipped} sin fechas válidas, omitidos` : ""}
            </p>
          ) : null}
          <Button type="button" size="sm" className="min-h-11 justify-self-start" disabled={busy} onClick={save}>
            Importar {[preview.days.length ? `${preview.days.length} días` : "", preview.workouts.length ? `${preview.workouts.length} entrenos` : ""].filter(Boolean).join(" y ")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
