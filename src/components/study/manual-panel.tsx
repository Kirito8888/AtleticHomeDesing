"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { SourcePicker, useSource } from "@/components/study/source-picker";
import { Button } from "@/components/ui/button";

/** Genera y descarga el manual práctico en PDF (A4, recetas con índice paginado). No se guarda en el servidor. */
export function ManualPanel({ docs, aiEnabled }: { docs: Array<{ id: string; title: string }>; aiEnabled: boolean }) {
  const s = useSource(docs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/study/manual", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: s.source }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Error ${res.status}`);
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "manual-practico.pdf";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Manual descargado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el manual");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Un PDF A4 con «recetas» para el examen práctico: pasos, comandos y comprobaciones, con un índice por tareas en la pág. 2 y otro alfabético al final, con la página exacta de cada receta.
      </p>
      <SourcePicker docs={docs} idPrefix="manual" s={s} />
      {!aiEnabled ? <p role="status" className="text-sm text-muted-foreground">Configura tu IA y acepta el consentimiento para generar el manual.</p> : null}
      <Button type="button" className="min-h-11" disabled={!aiEnabled || !s.ready || busy} onClick={generate}>
        <FileText /> {busy ? "Generando…" : "Generar manual práctico PDF"}
      </Button>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{busy ? "Generando el manual y maquetando el PDF (puede tardar hasta un minuto)…" : ""}</p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
