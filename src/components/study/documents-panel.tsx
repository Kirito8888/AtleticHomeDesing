"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileText, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/form/chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/client-api";
import { useSharedFiles } from "@/lib/share-client";
import { formatDate } from "@/lib/format";
import { confirmDialog } from "@/components/ui/confirm-dialog";

export interface DocItem {
  id: string;
  title: string;
  subject: string | null;
  moduleId: string | null;
  status: "PENDING" | "PROCESSING" | "EMBEDDED" | "FAILED";
  error: string | null;
  createdAt: string;
  chunks: number;
  flashcards: number;
}

const STATUS = { PENDING: "Pendiente", PROCESSING: "Procesando", EMBEDDED: "Listo", FAILED: "Error" } as const;

type Live = Pick<DocItem, "status" | "error" | "chunks" | "flashcards">;
const RUNNING = (st: DocItem["status"]) => st === "PENDING" || st === "PROCESSING";

export function DocumentsPanel({ docs: serverDocs, aiEnabled, modules }: { docs: DocItem[]; aiEnabled: boolean; modules: { id: string; name: string }[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  // v1.8 · llegado desde «Compartir»: queda elegido, falta pulsar «Subir»
  useSharedFiles("document", (shared) => {
    if (!fileRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(shared[0]);
    fileRef.current.files = dt.files;
    fileRef.current.scrollIntoView({ block: "center" });
    toast.info(`«${shared[0].name}» listo: pulsa Subir`);
  });
  const [subject, setSubject] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // v2.8.0 B4 (O9) · El proceso va en segundo plano: mientras haya apuntes en cola o en curso se sondea un
  // endpoint ligero (1 consulta) cada 3 s y solo se repinta la fila que cambia. La página entera se refresca
  // UNA vez cuando alguno termina (cuota, mazos…), no en cada sondeo.
  const [live, setLive] = useState<Record<string, Live>>({});
  const [seenDocs, setSeenDocs] = useState(serverDocs);
  if (seenDocs !== serverDocs) {
    setSeenDocs(serverDocs); // datos nuevos del servidor: lo sondeado deja de valer
    setLive({});
  }
  const docs = serverDocs.map((d) => (live[d.id] ? { ...d, ...live[d.id] } : d));
  const runningIds = docs.filter((d) => RUNNING(d.status)).map((d) => d.id).join(",");
  useEffect(() => {
    if (!runningIds) return;
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await api<Array<{ id: string } & Live>>(`/api/ai/documents/status?ids=${runningIds}`);
        if (stop) return;
        const next: Record<string, Live> = {};
        for (const x of r) next[x.id] = { status: x.status, error: x.error, chunks: x.chunks, flashcards: x.flashcards };
        setLive((cur) => {
          const changed = Object.entries(next).some(([id, v]) => !cur[id] || cur[id].status !== v.status || cur[id].chunks !== v.chunks || cur[id].flashcards !== v.flashcards || cur[id].error !== v.error);
          return changed ? { ...cur, ...next } : cur;
        });
        // Terminó alguno (o ya no existe): un único refresco completo
        const ids = runningIds.split(",");
        if (ids.some((id) => !next[id] || !RUNNING(next[id].status))) router.refresh();
      } catch {
        /* un fallo de red puntual no corta el seguimiento */
      }
    };
    const id = setInterval(() => void tick(), 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [runningIds, router]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Elige un fichero");
    const form = new FormData();
    form.set("file", file);
    if (subject) form.set("subject", subject);
    if (moduleId) form.set("moduleId", moduleId);
    setBusy("upload");
    try {
      await api("/api/ai/documents", { form });
      toast.success("Apuntes subidos: se están procesando en segundo plano");
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
      <form onSubmit={upload} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_12rem_12rem_auto] sm:items-end">
        <Field label="Apuntes (PDF, PPTX, TXT o Markdown, máx. 15 MB)" htmlFor="doc-file">
          <Input id="doc-file" ref={fileRef} type="file" accept=".pdf,.pptx,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" />
        </Field>
        <Field label="Asignatura" htmlFor="doc-subject">
          <Input id="doc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Bioquímica" />
        </Field>
        {modules.length ? (
          <Field label="Asignatura (módulo)" htmlFor="doc-module">
            <Select id="doc-module" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              <option value="">Ninguna</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Button type="submit" disabled={!aiEnabled || busy === "upload"}>
          <Upload /> {busy === "upload" ? "Subiendo…" : "Subir"}
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
                {d.status === "FAILED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!aiEnabled || busy === d.id}
                    onClick={() => action(d.id, () => api(`/api/ai/documents/${d.id}/retry`, { method: "POST" }), "Reintentando en segundo plano")}
                  >
                    <RotateCcw /> Reintentar
                  </Button>
                ) : null}
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
                  onClick={async () => (await confirmDialog({ title: `¿Borrar «${d.title}»?`, confirmLabel: "Borrar", destructive: true })) && action(d.id, () => api(`/api/ai/documents/${d.id}`, { method: "DELETE" }), "Documento borrado")}
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
