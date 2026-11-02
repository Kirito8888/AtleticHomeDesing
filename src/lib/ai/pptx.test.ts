import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";

import { buildPptxForTest } from "./pptx-fixture";
import { extractPptxPages, looksLikePptx, xmlText } from "./pptx";
import { contentMatches } from "./rag";

describe("xmlText", () => {
  it("une los runs de un párrafo, separa párrafos y decodifica entidades", () => {
    const xml = `<a:p><a:r><a:t>chmod </a:t></a:r><a:r><a:t>&lt;modo&gt; &amp; fichero</a:t></a:r></a:p><a:pPr/><a:p><a:r><a:t>Otra &#233; línea</a:t></a:r></a:p><a:p></a:p>`;
    expect(xmlText(xml)).toBe("chmod <modo> & fichero\nOtra é línea");
  });
  it("respeta los saltos de línea dentro de un párrafo", () => {
    expect(xmlText(`<a:p><a:r><a:t>uno</a:t></a:r><a:br/><a:r><a:t>dos</a:t></a:r></a:p>`)).toBe("uno\ndos");
  });
});

describe("extractPptxPages", () => {
  it("devuelve una página por diapositiva, con sus notas", () => {
    const buf = buildPptxForTest([{ text: ["Usuarios", "useradd -m ana"], notes: "Recordar -m" }, { text: ["Grupos"] }]);
    const pages = extractPptxPages(buf);
    expect(pages).toEqual(["Diapositiva 1\nUsuarios\nuseradd -m ana\nNotas: Recordar -m", "Diapositiva 2\nGrupos"]);
  });
  it("sigue el orden de la presentación, no el del número de fichero", () => {
    const files: Record<string, Uint8Array> = {
      "ppt/slides/slide1.xml": strToU8(`<a:p><a:t>PRIMERO-FICHERO</a:t></a:p>`),
      "ppt/slides/slide2.xml": strToU8(`<a:p><a:t>SEGUNDO-FICHERO</a:t></a:p>`),
      "ppt/presentation.xml": strToU8(`<p:sldIdLst><p:sldId id="1" r:id="rA"/><p:sldId id="2" r:id="rB"/></p:sldIdLst>`),
      "ppt/_rels/presentation.xml.rels": strToU8(`<Relationships><Relationship Id="rA" Target="slides/slide2.xml"/><Relationship Id="rB" Target="slides/slide1.xml"/></Relationships>`),
    };
    const pages = extractPptxPages(Buffer.from(zipSync(files)));
    expect(pages[0]).toContain("SEGUNDO-FICHERO");
    expect(pages[1]).toContain("PRIMERO-FICHERO");
  });
  it("omite diapositivas sin texto y falla si no queda ninguna", () => {
    expect(extractPptxPages(buildPptxForTest([{ text: [] }, { text: ["Hola"] }]))).toHaveLength(1);
    expect(() => extractPptxPages(buildPptxForTest([{ text: [] }]))).not.toThrow();
    expect(extractPptxPages(buildPptxForTest([{ text: [] }]))).toEqual([]);
  });
  it("rechaza un ZIP sin diapositivas y datos que no son ZIP", () => {
    expect(() => extractPptxPages(Buffer.from(zipSync({ "ppt/presentation.xml": strToU8("<p/>") })))).toThrow(/no tiene diapositivas/);
    expect(() => extractPptxPages(Buffer.from("esto no es un zip"))).toThrow();
  });
  it("corta una parte que se descomprime a un tamaño desmesurado (bomba)", () => {
    const big = new Uint8Array(9 * 1024 * 1024).fill(97);
    const buf = Buffer.from(zipSync({ "ppt/presentation.xml": strToU8("<p/>"), "ppt/slides/slide1.xml": big }));
    expect(buf.length).toBeLessThan(200_000);
    expect(() => extractPptxPages(buf)).toThrow(/demasiado grande/);
  });
});

describe("looksLikePptx / contentMatches", () => {
  it("acepta un pptx y rechaza un ZIP cualquiera o un PDF renombrado", () => {
    const ok = buildPptxForTest([{ text: ["x"] }]);
    expect(looksLikePptx(ok)).toBe(true);
    expect(looksLikePptx(Buffer.from(zipSync({ "otro.txt": strToU8("hola mundo, esto es largo largo largo") })))).toBe(false);
    expect(looksLikePptx(Buffer.from("%PDF-1.4 ......................................."))).toBe(false);
    expect(contentMatches(ok, "application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe(true);
  });
});
