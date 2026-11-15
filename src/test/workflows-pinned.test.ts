import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** V3-S03 · Cadena de suministro: acciones por SHA completo (con la etiqueta en un comentario) y permisos mínimos. */
const DIR = ".github/workflows";
const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));

describe("workflows de GitHub", () => {
  it("hay workflows que vigilar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const f of files) {
    const text = readFileSync(join(DIR, f), "utf8");
    it(`${f}: toda acción va fijada por SHA de 40 hex con comentario de etiqueta`, () => {
      const uses = [...text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)].filter((m) => !m[1].startsWith("./"));
      const bad = uses.filter((m) => !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(m[1]) || !/^\s+#\s*v\d/.test(m[2])).map((m) => m[0].trim());
      expect(bad).toEqual([]);
    });
    it(`${f}: declara permissions a nivel de workflow`, () => {
      expect(text).toMatch(/^permissions:\s*$/m);
    });
  }
});
