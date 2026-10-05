"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileText, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { formatDate } from "@/lib/format";

export interface DocItem {
  id: string;
  title: string;
  subject: string | null;
  status: "PENDING" | "PROCESSING" | "EMBEDDED" | "FAILED";
  error: string | null;
  createdAt: string;
  chunks: number;
  flashcards: number;
}

const STATUS = { PENDING: "Pendiente", PROCESSING: "Procesando", EMBEDDED: "Listo", FAILED: "Error" } as const;

export function DocumentsPanel({ docs, aiEnabled }: { docs: DocItem[]; aiEnabled: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Elige un fichero");
    const form = new FormData();
    form.set("file", file);
    if (subject) form.set("subject", subject);
    setBusy("upload");
    try {
      const d = await api<{ _count: { chunks: number } }>("/api/ai/documents", { form });
      toast.success(`Apuntes procesados: ${d._count.chunks} fragmentos`);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function action(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={upload} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="Apuntes (PDF, TXT o Markdown, máx. 15 MB)" htmlFor="doc-file">
          <Input id="doc-file" ref={fileRef} type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" />
        </Field>
        <Field label="Asignatura" htmlFor="doc-subject">
          <Input id="doc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Bioquímica" />
        </Field>
        <Button type="submit" disabled={!aiEnabled || busy === "upload"}>
          <Upload /> {busy === "upload" ? "Procesando…" : "Subir"}
        </Button>
      </form>

      {docs.length ? (
        <ul className="grid gap-2">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <FileText className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">
                  {d.subject ? `${d.subject} · ` : ""}
                  {d.chunks} fragmentos · {d.flashcards} flashcards · {formatDate(d.createdAt)}
                </div>
                {d.error ? <div className="text-xs text-destructive">{d.error}</div> : null}
              </div>
              <Badge variant={d.status === "FAILED" ? "destructive" : d.status === "EMBEDDED" ? "secondary" : "outline"}>{STATUS[d.status]}</Badge>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!aiEnabled || d.status !== "EMBEDDED" || busy === d.id}
                  onClick={() => action(d.id, () => api("/api/ai/flashcards/generate", { body: { documentId: d.id, count: 15 } }), "15 flashcards creadas")}
                >
                  <Sparkles /> Flashcards
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Borrar ${d.title}`}
                  disabled={busy === d.id}
                  onClick={() => confirm(`¿Borrar «${d.title}»?`) && action(d.id, () => api(`/api/ai/documents/${d.id}`, { method: "DELETE" }), "Documento borrado")}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Sube tus apuntes: se trocean, se vectorizan y podrás preguntarles y generar flashcards.</p>
      )}
    </div>
  );
}
