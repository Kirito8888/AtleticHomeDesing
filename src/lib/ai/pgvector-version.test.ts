import { describe, expect, it } from "vitest";

import { supportsIterativeScan } from "./pgvector-version";

describe("supportsIterativeScan", () => {
  it("solo desde pgvector 0.8", () => {
    expect(supportsIterativeScan("0.6.0")).toBe(false);
    expect(supportsIterativeScan("0.7.4")).toBe(false);
    expect(supportsIterativeScan("0.8.0")).toBe(true);
    expect(supportsIterativeScan("0.8.7")).toBe(true);
    expect(supportsIterativeScan("1.0.0")).toBe(true);
  });
  it("versión desconocida: no se activa", () => {
    expect(supportsIterativeScan(null)).toBe(false);
    expect(supportsIterativeScan("")).toBe(false);
  });
});
