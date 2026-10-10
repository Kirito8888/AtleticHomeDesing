"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";
import { useSharedFiles } from "@/lib/share-client";

type MesoPreview = {
  code: string;
  name: string;
  start: string;
  end: string;
  version: string | null;
  days: number;
  weeks: number;
  exercises: number;
  competitions: Array<{ date: string | null; relDay: number | null; title: string; variant: string | null }>;
  variants: Array<{ code: string; label: string }>;
  defaultVariant: string | null;
  currentVariant: string | null;
  warnings: string[];
  diff: { created: number; changed: number; unchanged: number; removed: number; keptDone: number };
};
type Preview = { mesos: MesoPreview[]; skipped: Array<{ name: string; reason: string }>; totalDays: number };
type Result = { mesos: string[]; days: number; sessionsCreated: number; sessionsUpdated: number; keptDone: number; events: number };

const MAX_BYTES = 30 * 1024 * 1024;

/** Planificación → Importar: sube el zip (o los PDF «día a día»), revisa y confirma. */
export function PlanImportSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  // v1.8 · llegado desde «Compartir»
  useSharedFiles("plan", (shared) => {
    setOpen(true);
    void analyse(shared);
  });

  function form() {
    const f = new FormData();
    for (const file of files) f.append("files", file);
    return f;
  }

  async function analyse(list: File[]) {
    setFiles(list);
    setPreview(null);
    if (!list.length) return;
    if (list.reduce((a, f) => a + f.size, 0) > MAX_BYTES) {
      toast.error("El plan supera 30 MB");
      return;
    }
    setBusy("preview");
    try {
      const f = new FormData();
      for (const file of list) f.append("files", file);
      setPreview(await api<Preview>("/api/planning/import", { form: f }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    setBusy("commit");
    try {
      const r = await api<Result>("/api/planning/import?commit=1", { form: form() });
      toast.success(
        `Plan importado: ${r.days} días en ${r.mesos.length} bloques · ${r.sessionsCreated} sesiones nuevas${r.sessionsUpdated ? `, ${r.sessionsUpdated} actualizadas` : ""}${r.keptDone ? ` · ${r.keptDone} ya hechas sin tocar` : ""}.`,
      );
      setOpen(false);
      setPreview(null);
      setFiles([]);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const changes = preview?.mesos.reduce((a, m) => a + m.diff.created + m.diff.changed + m.diff.removed, 0) ?? 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Importar plan">
          <FileUp /> <span className="hidden sm:inline">Importar plan</span>
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Importar planificación</SheetTitle>
          <SheetDescription>
            Sube el zip de tu plan o sus PDF «día a día». Los PDF no se guardan: solo se queda el plan ya ordenado por días. Puedes volver a subir una versión nueva
            del plan: se actualiza lo pendiente y no se toca lo que ya hiciste.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4">
          <Field label="Plan (.zip o .pdf)" htmlFor="plan-file">
            <Input id="plan-file" type="file" multiple accept=".zip,.pdf,application/zip,application/pdf" onChange={(e) => void analyse([...(e.target.files ?? [])])} />
          </Field>
          {busy === "preview" ? <p className="text-sm text-muted-foreground">Leyendo el plan… (unos segundos)</p> : null}

          {preview ? (
            <div className="grid gap-3" aria-label="Vista previa del plan">
              <p className="text-sm">
                <strong>{preview.totalDays}</strong> días en <strong>{preview.mesos.length}</strong> bloques.
              </p>
              <ul className="grid gap-2">
                {preview.mesos.map((m) => (
                  <li key={m.code} className="rounded-md border p-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {m.code} · {m.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(m.start)}–{formatDate(m.end)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {m.days} días · {m.weeks} semanas · {m.exercises} ejercicios{m.version ? ` · versión ${m.version}` : ""}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.diff.created ? <Badge variant="secondary">{m.diff.created} nuevos</Badge> : null}
                      {m.diff.changed ? <Badge variant="secondary">{m.diff.changed} cambian</Badge> : null}
                      {m.diff.removed ? <Badge variant="secondary">{m.diff.removed} se retiran</Badge> : null}
                      {m.diff.unchanged ? <Badge variant="outline">{m.diff.unchanged} iguales</Badge> : null}
                      {m.diff.keptDone ? <Badge variant="outline">{m.diff.keptDone} ya hechos: no se tocan</Badge> : null}
                    </div>
                    {m.variants.length ? (
                      <p className="mt-1.5 text-xs">
                        Versiones: {m.variants.map((v) => v.label).join(" / ")}. Activa:{" "}
                        <strong>{m.variants.find((v) => v.code === (m.currentVariant ?? m.defaultVariant))?.label}</strong> (la cambias luego en «Versiones del plan»).
                      </p>
                    ) : null}
                    {m.competitions.length ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        🏆{" "}
                        {[...new Set(m.competitions.map((c) => (c.date ? `${formatDate(c.date)} ${c.title}` : c.title)))].slice(0, 4).join(" · ")}
                      </p>
                    ) : null}
                    {m.warnings.length ? (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-amber-700 dark:text-amber-400">{m.warnings.length} avisos</summary>
                        <ul className="mt-1 list-disc pl-4">
                          {m.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
              {preview.skipped.length ? (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{preview.skipped.length} ficheros no se importan</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {preview.skipped.map((s) => (
                      <li key={s.name}>
                        {s.name}: {s.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <Button type="button" disabled={busy !== null || !preview.mesos.length || !changes} onClick={() => void commit()}>
                {busy === "commit" ? "Importando…" : changes ? `Importar ${preview.totalDays} días` : "Nada nuevo que importar"}
              </Button>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
