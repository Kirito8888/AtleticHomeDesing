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

  it("ninguna cadena de imports desde lib/ai llega a lib/health/{isak,cycle,women}* ni a lib/apple-fitness", () => {
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

  it("pilla un import de lib/recovery/health-sync (v3.1 B: Apple Salud no va a la IA)", () => {
    const read = () => 'import { x } from "@/lib/recovery/health-sync-service";';
    expect(forbiddenChains(["src/lib/ai/x.ts"], read, () => false).map((c) => c.at(-1))).toEqual(["src/lib/recovery/health-sync-service"]);
  });

  it("pilla un import de lib/nutrition/expenditure (v3.2 M: el gasto adaptativo usa el peso y no va a la IA)", () => {
    const read = () => 'import { expenditureFor } from "@/lib/nutrition/expenditure-service";';
    expect(forbiddenChains(["src/lib/ai/x.ts"], read, () => false).map((c) => c.at(-1))).toEqual(["src/lib/nutrition/expenditure-service"]);
  });

  it("pilla un import de lib/apple-fitness (v3.1: sus datos no van a la IA)", () => {
    const read = () => 'import { listPending } from "@/lib/apple-fitness/inbox-service";';
    expect(forbiddenChains(["src/lib/ai/x.ts"], read, () => false).map((c) => c.at(-1))).toEqual(["src/lib/apple-fitness/inbox-service"]);
  });

  it("no da falsos positivos con rutas parecidas", () => {
    const read = () => 'import "@/lib/health/safety-service";';
    expect(forbiddenChains(["src/lib/ai/x.ts"], read, () => false)).toEqual([]);
  });
});
