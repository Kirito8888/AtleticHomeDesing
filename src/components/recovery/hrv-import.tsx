"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { detectDelimiter, parseCsv } from "@/lib/finance/bank-import";
import type { HrvMapping } from "@/lib/recovery/hrv-import";

type Preview = { rows: Array<{ date: string; hrvRmssdMs: number | null; restingHr: number | null; sleepHours: number | null }>; total: number; errors: Array<{ line: number; message: string }> };

/** Importar VFC, FC en reposo y sueño desde el CSV de tu app (HRV4Training, Elite HRV, Garmin…). */
export function HrvImport({ saved }: { saved: HrvMapping | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [m, setM] = useState<HrvMapping>(saved ?? { delimiter: ",", dateCol: 0, dateFormat: "YYYY-MM-DD", hrvCol: null, rhrCol: null, sleepCol: null, sleepUnit: "h" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(f: File | null) {
    setFile(f);
    setPreview(null);
    if (!f) return;
    const text = await f.slice(0, 20_000).text();
    const delimiter = detectDelimiter(text);
    const first = parseCsv(text, delimiter)[0] ?? [];
    setHeader(first);
    // Si hay un mapeo guardado, se respeta; si no, se adivinan columnas por el nombre
    if (!saved) {
      const find = (re: RegExp) => {
        const i = first.findIndex((h) => re.test(h));
        return i >= 0 ? i : null;
      };
      setM({ delimiter, dateCol: find(/date|fecha|day|día/i) ?? 0, dateFormat: "YYYY-MM-DD", hrvCol: find(/rmssd|hrv|vfc/i), rhrCol: find(/rest|reposo|rhr|^hr$/i), sleepCol: find(/sleep|sueñ/i), sleepUnit: "h" });
    } else setM({ ...saved, delimiter });
  }

  async function send(commit: boolean) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("mapping", JSON.stringify(m));
    setBusy(true);
    try {
      const r = await api<Preview & { imported?: number }>(`/api/recovery/import${commit ? "?commit=1" : ""}`, { form });
      if (commit) {
        toast.success(`${r.imported} días importados`);
        setFile(null);
        setPreview(null);
        router.refresh();
      } else setPreview(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const col = (label: string, key: "dateCol" | "hrvCol" | "rhrCol" | "sleepCol", optional = true) => (
    <Field label={label} htmlFor={`hrv-${key}`}>
      <Select id={`hrv-${key}`} value={m[key] ?? ""} onChange={(e) => setM({ ...m, [key]: e.target.value === "" ? null : Number(e.target.value) })}>
        {optional ? <option value="">No importar</option> : null}
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h || `Columna ${i + 1}`}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <div className="grid gap-3 text-sm">
      <input aria-label="CSV de VFC y sueño" type="file" accept=".csv,text/csv" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
      {header.length ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {col("Fecha", "dateCol", false)}
            <Field label="Formato de fecha" htmlFor="hrv-fmt">
              <Select id="hrv-fmt" value={m.dateFormat} onChange={(e) => setM({ ...m, dateFormat: e.target.value as HrvMapping["dateFormat"] })}>
                {(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY"] as const).map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
            </Field>
            {col("VFC (rMSSD, ms)", "hrvCol")}
            {col("FC en reposo", "rhrCol")}
            {col("Sueño", "sleepCol")}
            <Field label="Sueño en" htmlFor="hrv-unit">
              <Select id="hrv-unit" value={m.sleepUnit} onChange={(e) => setM({ ...m, sleepUnit: e.target.value as "h" | "min" })}>
                <option value="h">horas</option>
                <option value="min">minutos</option>
              </Select>
            </Field>
          </div>
          <Button type="button" variant="outline" disabled={busy} onClick={() => send(false)}>
            Vista previa
          </Button>
        </>
      ) : null}
      {preview ? (
        <div className="grid gap-2" aria-label="Vista previa de la importación">
          <p>
            {preview.total} días{preview.errors.length ? ` · ${preview.errors.length} filas con error (líneas ${preview.errors.slice(0, 5).map((e) => e.line).join(", ")}…)` : ""}
          </p>
          <ul className="max-h-40 overflow-y-auto text-xs text-muted-foreground tabular-nums">
            {preview.rows.slice(0, 10).map((r) => (
              <li key={r.date}>
                {r.date}: VFC {r.hrvRmssdMs ?? "—"} · FC {r.restingHr ?? "—"} · sueño {r.sleepHours ?? "—"} h
              </li>
            ))}
          </ul>
          <Button type="button" disabled={busy || !preview.total} onClick={() => send(true)}>
            Importar {preview.total} días
          </Button>
          <p className="text-xs text-muted-foreground">Solo se escriben VFC, FC en reposo y sueño: el resto del registro de cada día no se toca.</p>
        </div>
      ) : null}
    </div>
  );
}
