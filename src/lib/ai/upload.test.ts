import { describe, expect, it } from "vitest";

import { contentMatches } from "./rag";

describe("contentMatches", () => {
  it("acepta un PDF real y rechaza un binario renombrado a .pdf", () => {
    expect(contentMatches(Buffer.from("%PDF-1.7\n..."), "application/pdf")).toBe(true);
    expect(contentMatches(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), "application/pdf")).toBe(false);
  });

  it("acepta texto UTF-8 (con tildes) y rechaza binarios o UTF-8 inválido", () => {
    expect(contentMatches(Buffer.from("# Tema 1\nCinemática y dinámica"), "text/markdown")).toBe(true);
    expect(contentMatches(Buffer.from([0x68, 0x00, 0x69]), "text/plain")).toBe(false);
    expect(contentMatches(Buffer.from([0xc3, 0x28]), "text/plain")).toBe(false);
  });
});
