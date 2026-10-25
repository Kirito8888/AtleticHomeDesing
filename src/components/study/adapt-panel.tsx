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
import { TAG_EMOJI, TAG_LABEL, attackPlan, type ReportDoc } from "@/lib/study/adhd-report";
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

function ReportReading({ doc }: { doc: ReportDoc }) {
  const sec = (title: string, children: React.ReactNode, open = false) => (
    <details open={open} className="rounded-md border">
      <summary className="min-h-11 cursor-pointer px-3 py-3 font-semibold">{title}</summary>
      <div className="grid gap-3 border-t p-3">{children}</div>
    </details>
  );
  const list = (items: string[]) => (
    <ul className="grid gap-2">
      {items.map((x, i) => (
        <li key={i} className="ml-4 list-disc"><Rich text={x} /></li>
      ))}
    </ul>
  );
  return (
    <div data-testid="adapt-report" className="grid max-w-prose gap-3 break-words text-base leading-relaxed">
      <h3 className="text-lg font-semibold">{doc.title}</h3>
      {sec("0. Mapa general", <ul className="grid gap-2">{doc.map.map((m, i) => <li key={i}>{TAG_EMOJI[m.tag]} {m.topic} <span className="text-sm text-muted-foreground">· {TAG_LABEL[m.tag]} · {m.minutes} min</span></li>)}</ul>, true)}
      {sec("1. Plan de ataque", <ol className="grid gap-2">{attackPlan(doc.map).map((m, i) => <li key={i} className="ml-5 list-decimal">{TAG_EMOJI[m.tag]} {m.topic} · {m.minutes} min</li>)}</ol>)}
      {sec(
        "2. Desglose por tema",
        doc.topics.map((t, i) => (
          <section key={i} className="grid gap-2 border-b pb-3 last:border-0">
            <h4 className="border-l-4 border-primary pl-2 font-semibold">{TAG_EMOJI[t.tag]} {t.name}</h4>
            <p className="text-sm font-medium text-muted-foreground">En 30 segundos</p>
            {list(t.inThirty)}
            <p className="text-sm font-medium text-muted-foreground">Conceptos clave</p>
            {list(t.concepts)}
            {t.commands.length ? <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm">{t.commands.map((c) => [c.syntax, c.error ? `# Error: ${c.error}` : "", c.paths ? `# Ruta: ${c.paths}` : ""].filter(Boolean).join("\n")).join("\n\n")}</pre> : null}
            {t.tables.map((tb, k) => (
              <div key={k} className="overflow-x-auto">
                <p className="text-sm font-medium">{tb.title}</p>
                <table className="w-full min-w-max text-sm">
                  <thead><tr>{tb.headers.map((h, c) => <th key={c} className="border-b p-1.5 text-left">{h}</th>)}</tr></thead>
                  <tbody>{tb.rows.map((r, a) => <tr key={a}>{tb.headers.map((_, c) => <td key={c} className="border-b p-1.5">{r[c]}</td>)}</tr>)}</tbody>
                </table>
              </div>
            ))}
            {t.traps.length ? <><p className="text-sm font-medium text-muted-foreground">Trampas de examen</p>{list(t.traps)}</> : null}
            {t.mnemonic ? <p className="rounded-md bg-muted p-2 text-sm">Mnemotecnia: {t.mnemonic}</p> : null}
          </section>
        )),
      )}
      {sec("3. Chuleta final", doc.cheatSheet.map((g, i) => <p key={i}><span className="font-semibold">{g.group}:</span> {g.terms.map((x, k) => <span key={k}><Rich text={x} />{k < g.terms.length - 1 ? " · " : ""}</span>)}</p>))}
      {sec(
        "4. Autoevaluación",
        <>
          {doc.selfTest.map((s, i) => (
            <div key={i} className="grid gap-1"><p className="font-medium">{i + 1}. {s.topic}</p>{list(s.recall)}{s.exercise ? <p className="text-sm">Ejercicio: {s.exercise}</p> : null}</div>
          ))}
          {doc.selfTest.length ? <><p className="font-medium">Soluciones</p>{doc.selfTest.map((s, i) => <div key={i}><p className="text-sm font-medium text-muted-foreground">{i + 1}. {s.topic}</p>{list(s.solutions)}</div>)}</> : <p className="text-sm text-muted-foreground">Sin temas 🔴 que evaluar.</p>}
        </>,
      )}
      {sec("5. Últimos 10 minutos", <ol className="grid gap-2">{doc.lastTen.map((x, i) => <li key={i} className="ml-5 list-decimal"><Rich text={x} /></li>)}</ol>)}
    </div>
  );
}

function Reading({ content }: { content: AdaptDoc }) {
  if (content.mode === "report") return <ReportReading doc={content.doc} />;
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
              { value: "report", label: MODE_LABEL.report },
            ]}
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          {mode === "summary"
            ? "Párrafos de 2–3 líneas con las ideas fuerza en negrita."
            : mode === "outline"
              ? "Árbol de ideas con la jerarquía clara, de 3 niveles como máximo."
              : "Mapa, plan de ataque, desglose, chuleta, autoevaluación y repaso final; viñetas de 15 palabras como máximo, solo con tus fuentes."}
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
