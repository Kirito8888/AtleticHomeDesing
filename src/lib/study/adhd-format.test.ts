import { describe, expect, it } from "vitest";

import { fakeAdapt, fromMarkdown, LIMITS, normalizeOutline, normalizeSummary, type OutlineNode, parseBold, splitBlock, stripBold, toMarkdown } from "./adhd-format";

const WALL =
  "La **glucólisis** es la vía que convierte la glucosa en piruvato. Ocurre en el citoplasma de la célula. Produce 2 ATP netos por molécula de glucosa. " +
  "Si hay oxígeno, el piruvato entra en la mitocondria. Si no lo hay, se convierte en lactato para regenerar NAD+. Es la base del metabolismo anaeróbico.";

const depthOf = (n: OutlineNode): number => 1 + Math.max(0, ...(n.children ?? []).map(depthOf));

describe("splitBlock", () => {
  it("parte un muro de texto en bloques ≤ 120 por frases enteras", () => {
    const blocks = splitBlock(WALL);
    expect(blocks.length).toBeGreaterThan(1);
    for (const b of blocks) expect(b.length).toBeLessThanOrEqual(LIMITS.block);
    expect(blocks.join(" ")).toContain("**glucólisis**");
  });
  it("no corta dentro de una negrita y no deja `**` sueltos", () => {
    for (const b of splitBlock("Una frase con **un concepto. con punto dentro** y más. " + "x".repeat(300))) expect(b.split("**").length % 2).toBe(1);
  });
  it("una frase sola demasiado larga se acorta por palabra con «…»", () => {
    const [b] = splitBlock("palabra ".repeat(60));
    expect(b.length).toBeLessThanOrEqual(LIMITS.block);
    expect(b.endsWith("…")).toBe(true);
  });
});

describe("parseBold", () => {
  it("separa negrita y texto", () => {
    expect(parseBold("a **b** c")).toEqual([{ text: "a ", bold: false }, { text: "b", bold: true }, { text: " c", bold: false }]);
  });
  it("una negrita sin cerrar se descarta y el HTML queda como texto", () => {
    expect(parseBold("a **b")).toEqual([{ text: "a b", bold: false }]);
    expect(parseBold("<b>x</b>")).toEqual([{ text: "<b>x</b>", bold: false }]);
  });
});

describe("normalizeSummary", () => {
  const raw = {
    title: "T",
    oneLiner: WALL,
    sections: Array.from({ length: 9 }, (_, i) => ({ heading: `Sección ${i} con un título larguísimo que no cabe en una línea del móvil`, blocks: [WALL, WALL] })),
    remember: ["a", "b", "c", "d", "e"],
  };
  const n = normalizeSummary(raw);
  it("respeta todos los límites", () => {
    expect(n.sections.length).toBe(LIMITS.sections);
    expect(n.oneLiner.length).toBeLessThanOrEqual(LIMITS.oneLiner);
    expect(n.remember.length).toBe(LIMITS.remember);
    for (const s of n.sections) {
      expect(s.heading.length).toBeLessThanOrEqual(LIMITS.sectionTitle);
      expect(s.blocks.length).toBeLessThanOrEqual(LIMITS.blocksPerSection);
      for (const b of s.blocks) expect(b.length).toBeLessThanOrEqual(LIMITS.block);
    }
  });
  it("quita bloques repetidos", () => {
    expect(normalizeSummary({ ...raw, sections: [{ heading: "A", blocks: ["Hola mundo.", "hola mundo."] }] }).sections[0].blocks).toEqual(["Hola mundo."]);
  });
});

describe("normalizeOutline", () => {
  const deep = (d: number): OutlineNode => ({ label: `n${d}`, detail: "d".repeat(400), children: d > 4 ? undefined : Array.from({ length: 9 }, (_, i) => ({ ...deep(d + 1), label: `n${d}-${i}` })) });
  it("limita profundidad (raíz + 3), ramas e hijos", () => {
    const o = normalizeOutline({ title: "T", root: deep(0) });
    expect(depthOf(o.root)).toBe(LIMITS.depth + 1);
    expect(o.root.children!.length).toBe(LIMITS.branches);
    expect(o.root.children![0].children!.length).toBe(LIMITS.children);
    expect(o.root.detail!.length).toBeLessThanOrEqual(LIMITS.detail);
  });
});

describe("toMarkdown y fakeAdapt", () => {
  it("el esquema sale como lista indentada de 2 espacios", () => {
    const md = toMarkdown({ mode: "outline", doc: { title: "T", root: { label: "Raíz", children: [{ label: "Rama", children: [{ label: "Hoja", detail: "x" }] }] } } });
    expect(md).toBe("# T\n\n- Raíz\n  - Rama\n    - Hoja — x\n");
  });
  it("el resumen lleva secciones y «Recuerda»", () => {
    const md = toMarkdown(fakeAdapt(WALL, "summary"));
    expect(md).toMatch(/^# /);
    expect(md).toContain("**En una frase:**");
    expect(md).toContain("## Recuerda");
  });
  it("la IA simulada cumple los límites en ambos modos", () => {
    const s = fakeAdapt(WALL, "summary");
    if (s.mode === "summary") for (const sec of s.doc.sections) for (const b of sec.blocks) expect(stripBold(b).length).toBeLessThanOrEqual(LIMITS.block);
    const o = fakeAdapt(WALL, "outline");
    if (o.mode === "outline") expect(depthOf(o.doc.root)).toBeLessThanOrEqual(LIMITS.depth + 1);
  });
});

describe("fromMarkdown (editar antes de guardar)", () => {
  const SRC = "Uno dos tres. Cuatro cinco seis. Siete ocho nueve. Diez once doce. Trece catorce quince. Dieciséis diecisiete.";
  it("ida y vuelta: sin editar, el resumen y el esquema no cambian", () => {
    for (const mode of ["summary", "outline"] as const) {
      const d = fakeAdapt(SRC, mode);
      expect(fromMarkdown(toMarkdown(d), d)).toEqual(d);
    }
  });
  it("el texto editado llega al documento y un muro se parte a ≤ 120", () => {
    const d = fakeAdapt(SRC, "summary");
    const out = fromMarkdown(`# Mi título\n\n**En una frase:** Mi idea\n\n## Tema\n\n${WALL}\n\n## Recuerda\n\n- a\n- b\n- c\n- d\n`, d);
    expect(out?.mode).toBe("summary");
    if (out?.mode !== "summary") return;
    expect(out.doc.title).toBe("Mi título");
    expect(out.doc.oneLiner).toBe("Mi idea");
    expect(out.doc.sections[0].blocks.length).toBeLessThanOrEqual(LIMITS.blocksPerSection);
    for (const b of out.doc.sections[0].blocks) expect(stripBold(b).length).toBeLessThanOrEqual(LIMITS.block);
    expect(out.doc.remember).toHaveLength(LIMITS.remember);
  });
  it("máximo de secciones y título borrado → conserva el original", () => {
    const d = fakeAdapt(SRC, "summary");
    const md = Array.from({ length: 8 }, (_, i) => `## S${i}\n\nTexto ${i}.`).join("\n\n");
    const out = fromMarkdown(md, d);
    if (out?.mode !== "summary" || d.mode !== "summary") throw new Error("modo");
    expect(out.doc.sections).toHaveLength(LIMITS.sections);
    expect(out.doc.title).toBe(d.doc.title);
  });
  it("esquema: limita la profundidad y tolera sangría de 4 espacios", () => {
    const d = fakeAdapt(SRC, "outline");
    const out = fromMarkdown("# T\n\n- R\n    - A — detalle\n        - B\n            - C\n                - D\n                    - E\n", d);
    if (out?.mode !== "outline") throw new Error("modo");
    expect(depthOf(out.doc.root)).toBeLessThanOrEqual(LIMITS.depth + 1);
    expect(out.doc.root.children?.[0].detail).toBe("detalle");
  });
  it("texto vacío → null", () => {
    expect(fromMarkdown("   \n", fakeAdapt(SRC, "summary"))).toBeNull();
    expect(fromMarkdown("", fakeAdapt(SRC, "report"))).toBeNull();
  });
});
