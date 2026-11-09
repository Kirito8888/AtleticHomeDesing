"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { api } from "@/lib/client-api";
import { CSV_TEMPLATE_HEADER, type IsakResult } from "@/lib/health/isak";

type Preview = { total: number; valid: number; imported: number; rows: Array<{ line: number; errors: string[]; date?: string; result?: IsakResult }> };

/** Importar mediciones ISAK desde CSV o JSON: vista previa con el cálculo y confirmación antes de guardar. */
export function BodyCompositionImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(commit: boolean) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    setBusy(true);
    try {
      const r = await api<Preview>(`/api/health/body-composition/import${commit ? "?commit=1" : ""}`, { form });
      if (commit) {
        toast.success(`${r.imported} mediciones importadas`);
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

  async function confirmImport() {
    if (!preview) return;
    if (!(await confirmDialog({ title: `¿Importar ${preview.valid} mediciones?`, description: "Se guardarán cifradas en tu histórico. Las filas con error se omiten.", confirmLabel: "Importar" }))) return;
    await send(true);
  }

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(`${CSV_TEMPLATE_HEADER.join(";")}\n2026-11-09;M;75;178;10;9;5;12;7;12;11;6;33,5;37;7;9,8;5,7\n`)}`;

  return (
    <div className="grid gap-3 text-sm">
      <p className="text-xs text-muted-foreground">
        CSV (separador «;» o «,», coma decimal admitida) o JSON (objeto o lista). Pliegues en mm, perímetros y diámetros en cm.{" "}
        <a className="underline" href={template} download="plantilla-isak.csv">
          Descargar plantilla CSV
        </a>
      </p>
      <input
        aria-label="Fichero CSV o JSON de mediciones ISAK"
        type="file"
        accept=".csv,.json,text/csv,application/json"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setPreview(null);
        }}
      />
      <Button type="button" variant="outline" disabled={busy || !file} onClick={() => send(false)}>
        Vista previa
      </Button>
      {preview ? (
        <div className="grid gap-2" aria-label="Vista previa de la importación">
          <p>
            {preview.total} filas · {preview.valid} válidas{preview.total - preview.valid ? ` · ${preview.total - preview.valid} con error` : ""}
          </p>
          <ul className="max-h-48 overflow-y-auto text-xs tabular-nums">
            {preview.rows.slice(0, 10).map((r) => (
              <li key={r.line} className={r.errors.length ? "text-destructive" : "text-muted-foreground"}>
                {r.errors.length
                  ? `Línea ${r.line}: ${r.errors.slice(0, 3).join("; ")}`
                  : `${r.date}: ${r.result!.somatotype.endo}-${r.result!.somatotype.meso}-${r.result!.somatotype.ecto} · grasa ${r.result!.masses.fat.pct} % (${r.result!.masses.fat.kg} kg) · músculo ${r.result!.masses.muscle.pct} % (${r.result!.masses.muscle.kg} kg)`}
              </li>
            ))}
          </ul>
          <Button type="button" disabled={busy || !preview.valid} onClick={confirmImport}>
            Importar {preview.valid} mediciones
          </Button>
        </div>
      ) : null}
    </div>
  );
}
