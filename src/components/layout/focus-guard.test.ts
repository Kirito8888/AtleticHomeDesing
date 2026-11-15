import { describe, expect, it } from "vitest";

import { obscuredShift } from "./focus-guard";

const vh = 844;
const header = { top: 0, bottom: 56, edge: "top" as const };
const nav = { top: 780, bottom: 844, edge: "bottom" as const };
const action = { top: 732, bottom: 780, edge: "bottom" as const };

describe("V3-A07 · foco no tapado por barras fijas", () => {
  it("a la vista entre las barras: no se mueve", () => {
    expect(obscuredShift({ top: 300, bottom: 344 }, [header, nav], vh)).toBe(0);
  });
  it("bajo la barra inferior: baja lo justo más el margen", () => {
    expect(obscuredShift({ top: 790, bottom: 834 }, [header, nav], vh)).toBe(834 - 780 + 8);
  });
  it("bajo la barra de acción fija: cuenta la más alta de abajo", () => {
    expect(obscuredShift({ top: 740, bottom: 784 }, [header, nav, action], vh)).toBe(784 - 732 + 8);
  });
  it("bajo la cabecera: sube", () => {
    expect(obscuredShift({ top: 20, bottom: 60 }, [header, nav], vh)).toBe(20 - 56 - 8);
  });
  it("sin barras (escritorio) no hace nada", () => {
    expect(obscuredShift({ top: 800, bottom: 840 }, [], vh)).toBe(0);
  });
});
