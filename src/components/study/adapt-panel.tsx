"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Chips, Field } from "@/components/form/chips";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { SourcePicker, useSource } from "@/components/study/source-picker";
import { api } from "@/lib/client-api";
import { type AdaptDoc, type AdaptMode, MODE_LABEL, type OutlineNode, parseBold } from "@/lib/study/adhd-format";

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
  const src = useSource(docs);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);


  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setResult(await api<Result>("/api/ai/study/adapt", { body: { mode, source: src.source } }));
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
        <SourcePicker docs={docs} idPrefix="adapt" s={src} />
        <Button type="submit" className="min-h-11" disabled={!aiEnabled || !src.ready || busy}>
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
