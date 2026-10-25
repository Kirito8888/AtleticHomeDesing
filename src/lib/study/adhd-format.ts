import { z } from "zod";

import { fakeReport, normalizeReport, reportSchema, reportToMarkdown, type ReportDoc } from "@/lib/study/adhd-report";
import { clip, parseBold, sentences, stripBold } from "@/lib/study/bold-text";

export { clip, parseBold, sentences, stripBold };
export type { Seg } from "@/lib/study/bold-text";

/**
 * Formatos de estudio de baja carga cognitiva (v2.5 · Estudio B12).
 *
 * Base (principios generales de diseño instruccional y legibilidad; no hay ensayos que validen un
 * formato concreto para TDAH, así que se aplican por extensión y sin lenguaje clínico):
 * carga cognitiva (Sweller), segmentación y señalización (Mayer: dividir en unidades y destacar lo
 * esencial), memoria de trabajo limitada a ~4 bloques (Cowan 2001) y déficit de memoria de trabajo
 * en TDAH (meta-análisis de Kasper, Alderson y Hudec 2012), y la guía de estilo de la BDA
 * (negrita en vez de cursiva, texto a la izquierda, frases cortas).
 *
 * Los límites se imponen aquí, no solo en el prompt: si el modelo devuelve muros de texto, el
 * resultado normalizado sigue cumpliéndolos.
 */
export type AdaptMode = "summary" | "outline" | "report";

export const LIMITS = {
  /** ≈ 3 líneas a 390 px con 16 px (~45 caracteres por línea). */
  block: 120,
  oneLiner: 120,
  sectionTitle: 40,
  sections: 5,
  blocksPerSection: 4,
  remember: 3,
  rememberItem: 90,
  branches: 6,
  children: 5,
  depth: 3,
  label: 60,
  detail: 120,
} as const;

// ---------------------------------------------------------------- esquemas (lo que devuelve la IA)

const text = z.string().trim().min(1).max(4000);

export const summarySchema = z.object({
  title: text,
  oneLiner: text,
  sections: z.array(z.object({ heading: text, blocks: z.array(text).min(1).max(20) })).min(1).max(20),
  remember: z.array(text).max(10).default([]),
});
export type SummaryDoc = z.infer<typeof summarySchema>;

export interface OutlineNode {
  label: string;
  detail?: string;
  children?: OutlineNode[];
}
const nodeSchema: z.ZodType<OutlineNode> = z.lazy(() =>
  z.object({ label: text, detail: z.string().trim().max(4000).optional(), children: z.array(nodeSchema).max(30).optional() }),
);
export const outlineSchema = z.object({ title: text, root: nodeSchema });
export type OutlineDoc = z.infer<typeof outlineSchema>;

export type AdaptDoc = { mode: "summary"; doc: SummaryDoc } | { mode: "outline"; doc: OutlineDoc } | { mode: "report"; doc: ReportDoc };

/** Lo que recibe el guardado: el cliente manda el documento y el servidor lo vuelve a validar. */
export const adaptDocSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("summary"), doc: summarySchema }),
  z.object({ mode: z.literal("outline"), doc: outlineSchema }),
  z.object({ mode: z.literal("report"), doc: reportSchema }),
]);

// ---------------------------------------------------------------- normalización
/** Parte un párrafo en bloques ≤ `max`, agrupando frases enteras. */
export function splitBlock(s: string, max: number = LIMITS.block): string[] {
  const out: string[] = [];
  let cur = "";
  for (const sen of sentences(s)) {
    const next = cur ? `${cur} ${sen}` : sen;
    if (next.length <= max) cur = next;
    else {
      if (cur) out.push(cur);
      cur = sen;
    }
  }
  if (cur) out.push(cur);
  return out.map((b) => clip(b, max)).filter(Boolean);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = i.toLowerCase().replace(/\*\*/g, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function normalizeSummary(raw: SummaryDoc): SummaryDoc {
  const sections = raw.sections
    .map((s) => ({
      heading: clip(s.heading, LIMITS.sectionTitle).replace(/\*\*/g, ""),
      blocks: dedupe(s.blocks.flatMap((b) => splitBlock(b))).slice(0, LIMITS.blocksPerSection),
    }))
    .filter((s) => s.blocks.length)
    .slice(0, LIMITS.sections);
  return {
    title: clip(raw.title, 80).replace(/\*\*/g, ""),
    oneLiner: clip(raw.oneLiner, LIMITS.oneLiner),
    sections,
    remember: dedupe(raw.remember.map((r) => clip(r, LIMITS.rememberItem)).filter(Boolean)).slice(0, LIMITS.remember),
  };
}

function normalizeNode(n: OutlineNode, depth: number): OutlineNode {
  const detail = n.detail ? clip(n.detail, LIMITS.detail) : undefined;
  const kids =
    depth < LIMITS.depth && n.children?.length
      ? dedupeNodes(n.children.map((c) => normalizeNode(c, depth + 1))).slice(0, depth === 0 ? LIMITS.branches : LIMITS.children)
      : undefined;
  return { label: clip(n.label, LIMITS.label), ...(detail ? { detail } : {}), ...(kids?.length ? { children: kids } : {}) };
}
function dedupeNodes(nodes: OutlineNode[]): OutlineNode[] {
  const seen = new Set<string>();
  return nodes.filter((n) => {
    const k = n.label.toLowerCase().replace(/\*\*/g, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** La raíz es el nivel 0; con `depth` 3 hay raíz → rama → hijo → nieto. */
export function normalizeOutline(raw: OutlineDoc): OutlineDoc {
  return { title: clip(raw.title, 80).replace(/\*\*/g, ""), root: normalizeNode(raw.root, 0) };
}

export function normalizeDoc(d: AdaptDoc): AdaptDoc {
  if (d.mode === "report") return { mode: "report", doc: normalizeReport(d.doc) };
  return d.mode === "summary" ? { mode: "summary", doc: normalizeSummary(d.doc) } : { mode: "outline", doc: normalizeOutline(d.doc) };
}

// ---------------------------------------------------------------- negrita y exportación

function outlineLines(n: OutlineNode, depth: number, out: string[]) {
  out.push(`${"  ".repeat(depth)}- ${n.label}${n.detail ? ` — ${n.detail}` : ""}`);
  for (const c of n.children ?? []) outlineLines(c, depth + 1, out);
}

export function toMarkdown(d: AdaptDoc): string {
  if (d.mode === "report") return reportToMarkdown(d.doc);
  if (d.mode === "summary") {
    const { title, oneLiner, sections, remember } = d.doc;
    const parts = [`# ${title}`, `**En una frase:** ${oneLiner}`];
    for (const s of sections) parts.push(`## ${s.heading}\n\n${s.blocks.join("\n\n")}`);
    if (remember.length) parts.push(`## Recuerda\n\n${remember.map((r) => `- ${r}`).join("\n")}`);
    return `${parts.join("\n\n")}\n`;
  }
  const lines: string[] = [];
  outlineLines(d.doc.root, 0, lines);
  return `# ${d.doc.title}\n\n${lines.join("\n")}\n`;
}

export const MODE_LABEL: Record<AdaptMode, string> = { summary: "Resumen TDAH", outline: "Esquema visual", report: "Informe TDAH" };

// ---------------------------------------------------------------- IA simulada (LIFEOS_FAKE_AI=1)

/** Determinista y sin red: usa las frases del propio texto. */
export function fakeAdapt(source: string, mode: AdaptMode): AdaptDoc {
  if (mode === "report") return { mode: "report", doc: fakeReport(source) };
  const sens = sentences(source).filter((s) => s.length > 3);
  const first = sens[0] ?? "Apuntes";
  const pick = (from: number, n: number) => sens.slice(from, from + n);
  if (mode === "summary") {
    const sections = [0, 1, 2]
      .map((i) => ({ heading: `Idea ${i + 1}`, blocks: pick(i * 2, 2).map((s) => s.replace(/^(\S+)/, "**$1**")) }))
      .filter((s) => s.blocks.length);
    return {
      mode: "summary",
      doc: normalizeSummary({
        title: clip(first, 60),
        oneLiner: first,
        sections: sections.length ? sections : [{ heading: "Idea 1", blocks: [first] }],
        remember: pick(0, 3),
      }),
    };
  }
  const branches = [0, 1, 2]
    .map((i) => ({ label: `Idea ${i + 1}`, children: pick(i * 2, 2).map((s) => ({ label: s })) }))
    .filter((b) => b.children.length);
  return { mode: "outline", doc: normalizeOutline({ title: clip(first, 60), root: { label: clip(first, 60), children: branches } }) };
}
