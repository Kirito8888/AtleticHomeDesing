import { describe, expect, it } from "vitest";

import { chunkDocument, chunkText } from "./chunking";
import { sm2 } from "./sm2";

const para = (n: number, words = 40) =>
  Array.from({ length: n }, (_, i) => `Párrafo ${i}. ` + "palabra ".repeat(words).trim() + ".").join("\n\n");

describe("chunkText", () => {
  it("texto corto = un solo fragmento", () => {
    expect(chunkText("Hola mundo.")).toEqual([{ content: "Hola mundo.", page: null }]);
  });

  it("respeta el tamaño máximo y solapa entre fragmentos", () => {
    const chunks = chunkText(para(30), null, { maxChars: 600, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(600);
    // el inicio de cada fragmento aparece al final del anterior (solape)
    const head = chunks[1].content.slice(0, 20);
    expect(chunks[0].content).toContain(head);
  });

  it("no corta palabras por la mitad", () => {
    const chunks = chunkText("abcdefghij ".repeat(300), null, { maxChars: 500, overlap: 50 });
    for (const c of chunks) {
      expect(c.content.startsWith("abcdefghij")).toBe(true);
      expect(c.content.endsWith("abcdefghij")).toBe(true);
    }
  });

  it("siempre termina (sin bucles) con texto sin espacios", () => {
    const chunks = chunkText("x".repeat(5000), null, { maxChars: 1000, overlap: 200 });
    expect(chunks.at(-1)!.content.endsWith("x")).toBe(true);
    expect(chunks.length).toBeLessThan(10);
  });
});

describe("chunkDocument", () => {
  it("numera páginas en PDFs y los índices son globales", () => {
    const chunks = chunkDocument(["Página uno.", "Página dos."]);
    expect(chunks).toEqual([
      { content: "Página uno.", page: 1, index: 0 },
      { content: "Página dos.", page: 2, index: 1 },
    ]);
  });
  it("documento de texto plano no lleva página", () => {
    expect(chunkDocument(["solo texto"])[0].page).toBeNull();
  });
});

describe("sm2", () => {
  const fresh = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };
  it("intervalos 1 → 6 → 6·EF con respuestas correctas", () => {
    const a = sm2(fresh, 4);
    const b = sm2(a, 4);
    const c = sm2(b, 4);
    expect([a.intervalDays, b.intervalDays, c.intervalDays]).toEqual([1, 6, 15]);
  });
  it("un fallo reinicia la serie y baja el EF", () => {
    const r = sm2({ easeFactor: 2.5, intervalDays: 15, repetitions: 3 }, 1);
    expect(r).toEqual({ easeFactor: 2.3, intervalDays: 1, repetitions: 0 });
  });
  it("el EF nunca baja de 1.3", () => {
    let s = fresh;
    for (let i = 0; i < 20; i++) s = sm2(s, 3);
    expect(s.easeFactor).toBe(1.3);
  });
});
