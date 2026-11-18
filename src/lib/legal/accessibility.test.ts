import { describe, expect, it } from "vitest";

import { A11Y_KNOWN_ISSUES, A11Y_STATUS, A11Y_STATUS_LABEL, A11Y_VERIFIED } from "./accessibility";

describe("declaración de accesibilidad", () => {
  it("no declara cumplimiento total mientras falte la prueba con lector de pantalla", () => {
    expect(A11Y_STATUS).toBe("partial");
    expect(A11Y_STATUS_LABEL[A11Y_STATUS]).toMatch(/parcialmente/);
    expect(A11Y_KNOWN_ISSUES.some((t) => /lector de pantalla/.test(t))).toBe(true);
    expect(A11Y_VERIFIED.length).toBeGreaterThan(0);
  });
  it("no filtra datos de la instalación (IP, dominio, correo)", () => {
    const all = [...A11Y_VERIFIED, ...A11Y_KNOWN_ISSUES].join(" ");
    expect(all).not.toMatch(/@|https?:|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});
