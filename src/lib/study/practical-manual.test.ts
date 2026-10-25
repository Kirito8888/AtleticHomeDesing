import { describe, expect, it } from "vitest";

import { alphaEntries, buildManualPrompt, fakeManual, locateCodes, manualAiSchema, marker, normalizeManual, renderManualHtml, samePages } from "./practical-manual";

const manual = () => normalizeManual(manualAiSchema.parse(fakeManual("Apuntes de prueba sobre servidores y redes")));

describe("buildManualPrompt", () => {
  const p = buildManualPrompt({ label: "Redes", sources: "texto fuente" });
  it("trata las fuentes como datos y no nombra modelos", () => {
    expect(p.prompt).toContain("<FUENTES>\ntexto fuente\n</FUENTES>");
    expect(p.system).toMatch(/SOLO la información/);
    expect(p.system + p.prompt).not.toMatch(/gpt|gemini|claude|llama|mistral/i);
  });
});

describe("normalizeManual", () => {
  it("asigna códigos únicos A1, A2, B1…", () => {
    const codes = manual().sections.flatMap((s) => s.recipes.map((r) => r.code));
    expect(codes).toEqual(["A1", "A2", "B1"]);
  });
  it("rechaza más de 8 secciones", () => {
    const sec = { name: "S", recipes: [{ title: "T" }] };
    expect(manualAiSchema.safeParse({ title: "M", sections: Array(9).fill(sec) }).success).toBe(false);
  });
});

describe("renderManualHtml", () => {
  it("escapa el HTML de la IA", () => {
    const m = manual();
    m.sections[0].recipes[0].title = "<script>alert(1)</script>";
    const html = renderManualHtml(m);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("usa marcador fijo sin páginas e inyecta los números exactos con ellas", () => {
    const m = manual();
    expect(renderManualHtml(m)).toContain('<td class="pg">000</td>');
    const html = renderManualHtml(m, new Map([["A1", 3], ["A2", 4], ["B1", 7]]));
    expect(html).not.toContain(">000<");
    expect(html).toMatch(/\[A1\]<\/b> Preparar el entorno<\/td><td class="pg">3</);
    expect(html).toMatch(/Resolver un caso completo <b>\[B1\]<\/b><\/td><td class="pg">7</);
  });
  it("lleva los dos índices y una página con nombre por sección", () => {
    const html = renderManualHtml(manual());
    expect(html).toContain("Índice por tareas");
    expect(html).toContain("Índice alfabético");
    expect(html).toContain("page:sec-A");
    expect(html).toContain("@page sec-B");
  });
});

describe("alphaEntries / locateCodes", () => {
  it("ordena en es-ES y repite código por palabra clave", () => {
    const terms = alphaEntries(manual()).map((e) => e.term);
    expect(terms).toEqual([...terms].sort((a, b) => a.localeCompare(b, "es")));
    expect(terms).toContain("validar");
  });
  it("localiza la primera página con el marcador", () => {
    const pages = ["portada", "índice", `x ${marker("A1")} y`, `${marker("A2")} ${marker("A1")}`];
    const f = locateCodes(pages, ["A1", "A2", "Z9"]);
    expect([...f]).toEqual([["A1", 3], ["A2", 4]]);
    expect(samePages(f, new Map([["A1", 3], ["A2", 4]]))).toBe(true);
    expect(samePages(f, new Map([["A1", 3]]))).toBe(false);
  });
});
