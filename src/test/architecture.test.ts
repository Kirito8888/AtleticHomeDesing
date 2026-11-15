import { describe, expect, it } from "vitest";

import { forbiddenChains, listSources } from "./architecture";

/**
 * V3-S13 · La salud cifrada (composición corporal ISAK, ciclo, salud de la mujer) no puede llegar
 * a la IA: ningún fichero de `lib/ai/**` la importa, ni directa ni transitivamente.
 */
describe("arquitectura: lib/ai no alcanza la salud cifrada", () => {
  it("hay ficheros de IA que vigilar", () => {
    expect(listSources("src/lib/ai").length).toBeGreaterThan(5);
  });

  it("ninguna cadena de imports desde lib/ai llega a lib/health/{isak,cycle,women}*", () => {
    const chains = forbiddenChains(listSources("src/lib/ai"));
    expect(chains.map((c) => c.join(" → "))).toEqual([]);
  });

  it("el detector funciona: pilla un import directo y uno transitivo", () => {
    const files: Record<string, string> = {
      "src/lib/ai/x.ts": 'import { a } from "@/lib/ai/y";\nimport("@/lib/health/women");',
      "src/lib/ai/y.ts": 'export { c } from "../health/cycle-service";',
    };
    const read = (p: string) => files[p] ?? "";
    const exists = (p: string) => p in files;
    const chains = forbiddenChains(["src/lib/ai/x.ts"], read, exists).map((c) => c.at(-1));
    expect(chains.sort()).toEqual(["src/lib/health/cycle-service", "src/lib/health/women"]);
  });

  it("no da falsos positivos con rutas parecidas", () => {
    const read = () => 'import "@/lib/health/safety-service";';
    expect(forbiddenChains(["src/lib/ai/x.ts"], read, () => false)).toEqual([]);
  });
});
