import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { DocxError, extractDocxPages, htmlToLines, inspectDocx, isEncryptedOffice, looksLikeDocx, pagesFromLines } from "./docx";
import { buildDocxForTest } from "./docx-fixture";

const code = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    return e instanceof DocxError ? e.code : "otro";
  }
  return "ok";
};

describe("htmlToLines / pagesFromLines", () => {
  it("convierte encabezados, listas y tablas y decodifica entidades", () => {
    const html = `<h1>Tema &amp; 1</h1><p>uno<br />dos &#233;</p><ul><li>a</li><li>b &lt;x&gt;</li></ul><table><tr><td>c1</td><td>c2</td></tr></table><p></p>`;
    expect(htmlToLines(html)).toEqual(["# Tema & 1", "uno\ndos é", "- a", "- b <x>", "c1 | c2"]);
  });
  it("una página por h1/h2; sin encabezados, una sola", () => {
    expect(pagesFromLines(["# A", "x", "## B", "y", "### C", "z"])).toEqual(["# A\nx", "## B\ny\n### C\nz"]);
    expect(pagesFromLines(["x", "y"])).toEqual(["x\ny"]);
  });
});

describe("extractDocxPages", () => {
  it("extrae texto estructurado por secciones (con tildes)", async () => {
    const buf = buildDocxForTest([
      { h: 1, text: "Permisos" },
      { text: "chmod cambia los permisos" },
      { li: "lectura" },
      { li: "escritura" },
      { h: 1, text: "Año académico" },
      { row: ["Comando", "Uso"] },
    ]);
    const pages = await extractDocxPages(buf);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toBe("# Permisos\nchmod cambia los permisos\n- lectura\n- escritura");
    expect(pages[1]).toBe("# Año académico\nComando | Uso");
  });
  it("un documento sin encabezados es una sola página", async () => {
    expect(await extractDocxPages(buildDocxForTest([{ text: "uno" }, { text: "dos" }]))).toEqual(["uno\ndos"]);
  });
  it("sin texto → error «empty»", async () => {
    expect(await code(extractDocxPages(buildDocxForTest([{ text: "" }])))).toBe("empty");
  });
});

describe("validación y topes", () => {
  const ok = buildDocxForTest([{ text: "hola" }]);
  it("reconoce un DOCX y un contenedor cifrado", async () => {
    expect(looksLikeDocx(ok)).toBe(true);
    const cfb = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
    expect(isEncryptedOffice(cfb)).toBe(true);
    expect(await code(() => inspectDocx(cfb))).toBe("encrypted");
  });
  it("basura, ZIP sin word/document.xml y ZIP truncado → error controlado", async () => {
    expect(await code(() => inspectDocx(Buffer.from("no soy un zip, ni de lejos")))).toBe("invalid");
    expect(await code(() => inspectDocx(Buffer.from(zipSync({ "a.txt": strToU8("x") }))))).toBe("invalid");
    expect(await code(extractDocxPages(ok.subarray(0, ok.length - 30)))).toBe("invalid");
  });
  it("una parte que declara más del tope se rechaza sin descomprimir", async () => {
    const big = Buffer.from(zipSync({ "word/document.xml": strToU8("x") }));
    // Falsea el tamaño original declarado (cabecera local y directorio central) a ~100 MB.
    const declared = Buffer.alloc(4);
    declared.writeUInt32LE(100 * 1024 * 1024);
    for (let i = 0; i + 4 < big.length; i++) {
      const sig = big.readUInt32LE(i);
      if (sig === 0x04034b50) declared.copy(big, i + 22);
      if (sig === 0x02014b50) declared.copy(big, i + 24);
    }
    expect(await code(() => inspectDocx(big))).toBe("too_big");
    expect(await code(extractDocxPages(big))).toBe("too_big");
  });
  it("una «bomba» real (muy comprimible, > tope por entrada) se corta", async () => {
    const bomb = Buffer.from(zipSync({ "word/document.xml": new Uint8Array(17 * 1024 * 1024) }, { level: 9 }));
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(await code(extractDocxPages(bomb))).toBe("too_big");
  });
});
