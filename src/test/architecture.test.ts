import { readFileSync } from "node:fs";
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

/**
 * v3.3 E1 · Suite de entrenadora: una ficha gestionada (atleta sin cuenta) es un `User` sin acceso. Toda consulta que RECORRE
 * usuarias (cron, push, informes, rotación de claves, panel de admin…) debe excluirla con `notManaged`; una consulta por
 * lista de ids (`id: { in: … }`) ya viene acotada por quien la llama y no barre. Un filtro olvidado no rompe nada visible,
 * pero mandaría trabajo o IA a una ficha: por eso lo vigila un test y no la memoria.
 */
describe("arquitectura: los barridos de usuarias excluyen las fichas gestionadas", () => {
  const callsOf = (src: string): string[] => {
    const out: string[] = [];
    for (const m of src.matchAll(/prisma\.user\.(findMany|count|groupBy)\(/g)) {
      let depth = 1;
      let i = (m.index ?? 0) + m[0].length;
      const start = i;
      while (i < src.length && depth > 0) {
        const c = src[i++];
        if (c === "(") depth++;
        else if (c === ")") depth--;
      }
      out.push(src.slice(start, i));
    }
    return out;
  };
  const sweeps = (src: string) => callsOf(src).filter((c) => !/notManaged|id:\s*\{\s*in:/.test(c));

  it("el detector funciona: pilla un barrido sin filtro y deja pasar los filtrados y los de lista de ids", () => {
    expect(sweeps("prisma.user.findMany({ where: { role: 'ADMIN' } })")).toHaveLength(1);
    expect(sweeps("prisma.user.findMany({ where: { ...notManaged, role: 'ADMIN' } })")).toHaveLength(0);
    expect(sweeps("prisma.user.findMany({ where: { id: { in: ids } } })")).toHaveLength(0);
  });

  it("ningún barrido de usuarias del código de la app se deja sin filtrar", () => {
    const files = [...listSources("src/lib"), ...listSources("src/app")].filter((f) => !/\.test\.|\/generated\//.test(f));
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (sweeps(text).length) offenders.push(f);
    }
    // `users.ts` solo cuenta si hay alguna cuenta (alta del primer ADMIN): una ficha exige una entrenadora previa, así que no cambia el resultado
    expect(offenders.filter((f) => !f.endsWith("src/lib/auth/users.ts"))).toEqual([]);
  });
});
