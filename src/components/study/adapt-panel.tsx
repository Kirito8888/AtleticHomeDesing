"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client-api";
import { type AdaptDoc, type AdaptMode, MODE_LABEL, type OutlineNode, parseBold } from "@/lib/study/adhd-format";

type SourceKind = "document" | "topic" | "text";
interface Result {
  content: AdaptDoc;
  markdown: string;
  sourceLabel: string;
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {parseBold(text).map((s, i) => (s.bold ? <strong key={i} className="font-semibold text-foreground">{s.text}</strong> : <span key={i}>{s.text}</span>))}
    </>
  );
}

function Tree({ node, depth = 0 }: { node: OutlineNode; depth?: number }) {
  const body = (
    <>
      <span className={depth === 0 ? "text-lg font-semibold" : ""}><Rich text={node.label} /></span>
      {node.detail ? <span className="block text-sm text-muted-foreground"><Rich text={node.detail} /></span> : null}
    </>
  );
  if (!node.children?.length) return <li className="py-1" data-depth={depth}>{body}</li>;
  return (
    <li data-depth={depth} className="py-1">
      <details open>
        <summary className="min-h-11 cursor-pointer py-2 marker:text-muted-foreground">{body}</summary>
        <ul className="ml-2 grid gap-0.5 border-l-2 border-muted pl-3">
          {node.children.map((c, i) => (
            <Tree key={i} node={c} depth={depth + 1} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function Reading({ content }: { content: AdaptDoc }) {
  if (content.mode === "outline") {
    return (
      <div data-testid="adapt-outline" className="break-words text-base leading-relaxed">
        <h3 className="mb-2 text-lg font-semibold">{content.doc.title}</h3>
        <ul>
          <Tree node={content.doc.root} />
        </ul>
      </div>
    );
  }
  const { title, oneLiner, sections, remember } = content.doc;
  return (
    <div data-testid="adapt-summary" className="grid max-w-prose gap-5 break-words text-base leading-relaxed">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="rounded-md bg-muted p-3"><span className="text-sm text-muted-foreground">En una frase</span><br /><Rich text={oneLiner} /></p>
      {sections.map((s, i) => (
        <section key={i} className="grid gap-3">
          <h4 className="border-l-4 border-primary pl-2 font-semibold">{s.heading}</h4>
          {s.blocks.map((b, j) => (
            <p key={j} data-block><Rich text={b} /></p>
          ))}
        </section>
      ))}
      {remember.length ? (
        <section className="grid gap-2 rounded-md border p-3">
          <h4 className="font-semibold">Recuerda</h4>
          <ul className="grid gap-2">
            {remember.map((r, i) => (
              <li key={i} className="ml-4 list-disc"><Rich text={r} /></li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function AdaptPanel({ docs, aiEnabled }: { docs: Array<{ id: string; title: string }>; aiEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<AdaptMode>("summary");
  const [kind, setKind] = useState<SourceKind>(docs.length ? "document" : "text");
  const [documentId, setDocumentId] = useState(docs[0]?.id ?? "");
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const ready = kind === "document" ? Boolean(documentId) : kind === "topic" ? topic.trim().length >= 2 : text.trim().length >= 40;

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    const source = kind === "document" ? { kind, documentId } : kind === "topic" ? { kind, topic: topic.trim() } : { kind, text: text.trim() };
    setBusy(true);
    try {
      setResult(await api<Result>("/api/ai/study/adapt", { body: { mode, source } }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  async function save() {
    if (!result) return;
    const name = `${MODE_LABEL[result.content.mode]} · ${result.content.doc.title}`;
    const ok = await confirmDialog({
      title: "¿Guardar en tus apuntes?",
      description: `Se crea un apunte nuevo «${name}». Tus apuntes y flashcards actuales no cambian.`,
      confirmLabel: "Guardar",
    });
    if (!ok) return;
    try {
      await api("/api/ai/study/adapt/save", { body: { content: result.content } });
      toast.success("Guardado en Apuntes");
      setResult(null);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={generate} className="grid gap-3 rounded-lg border p-3">
        <Field label="Formato">
          <Chips
            label="Formato"
            value={mode}
            onChange={(v) => v && setMode(v)}
            options={[
              { value: "summary", label: MODE_LABEL.summary },
              { value: "outline", label: MODE_LABEL.outline },
            ]}
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          {mode === "summary" ? "Párrafos de 2–3 líneas con las ideas fuerza en negrita." : "Árbol de ideas con la jerarquía clara, de 3 niveles como máximo."}
        </p>
        <Field label="A partir de">
          <Chips
            label="Origen"
            value={kind}
            onChange={(v) => v && setKind(v)}
            options={[
              { value: "document", label: "Un apunte" },
              { value: "topic", label: "Un tema" },
              { value: "text", label: "Texto" },
            ]}
          />
        </Field>
        {kind === "document" ? (
          docs.length ? (
            <Field label="Apunte" htmlFor="adapt-doc">
              <Select id="adapt-doc" value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-muted-foreground">Aún no tienes apuntes listos: sube uno en Apuntes o pega un texto.</p>
          )
        ) : kind === "topic" ? (
          <Field label="Tema (se busca en tus apuntes)" htmlFor="adapt-topic">
            <Input id="adapt-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Glucólisis" />
          </Field>
        ) : (
          <Field label="Pega tus apuntes (mín. 40 caracteres)" htmlFor="adapt-text">
            <Textarea id="adapt-text" value={text} onChange={(e) => setText(e.target.value)} className="min-h-32" />
          </Field>
        )}
        <Button type="submit" className="min-h-11" disabled={!aiEnabled || !ready || busy}>
          <Sparkles /> {busy ? "Generando…" : "Generar"}
        </Button>
        {!aiEnabled ? <p className="text-xs text-muted-foreground">Necesitas la IA activada en Ajustes para generar.</p> : null}
      </form>

      {result ? (
        <div className="grid gap-3" aria-live="polite">
          <Reading content={result.content} />
          <div className="grid grid-cols-3 gap-2 border-t pt-3">
            <Button type="button" variant="outline" className="min-h-11" onClick={copy}>
              <Copy /> Copiar
            </Button>
            <Button type="button" className="min-h-11" onClick={save}>
              <Save /> Guardar
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setResult(null)}>
              <X /> Descartar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Nada se guarda hasta que pulses «Guardar»; se crea un apunte nuevo.</p>
        </div>
      ) : null}
    </div>
  );
}
