import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/** Módulos de salud cifrada que la IA nunca debe poder alcanzar (V3-S13). */
export const FORBIDDEN = /(^|\/)lib\/health\/(isak|cycle|women)/;

const SPEC = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;

export function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return listSources(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

export function specifiers(code: string): string[] {
  return [...code.matchAll(SPEC)].map((m) => m[1]);
}

/** `@/x` → `src/x`; relativas contra el fichero; paquetes (`zod`…) → null. */
export function resolveSpec(from: string, spec: string, exists: (p: string) => boolean = existsSync): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = normalize(join(dirname(from), spec));
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (/\.(ts|tsx)$/.test(c) && exists(c)) return c;
  }
  return base; // sin fichero real: se conserva la ruta para poder casarla igualmente
}

/**
 * Recorre los imports de `roots` (en profundidad, dentro de src) y devuelve las cadenas
 * `a → b → … → módulo prohibido`. `read` y `exists` se inyectan para poder probarlo en memoria.
 */
export function forbiddenChains(
  roots: string[],
  read: (p: string) => string = (p) => readFileSync(p, "utf8"),
  exists: (p: string) => boolean = existsSync,
): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  const walk = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    let code: string;
    try {
      code = read(file);
    } catch {
      return;
    }
    for (const spec of specifiers(code)) {
      const target = resolveSpec(file, spec, exists);
      if (!target) continue;
      const next = [...chain, target];
      if (FORBIDDEN.test(target)) out.push(next);
      else if (target.startsWith("src/") && /\.(ts|tsx)$/.test(target)) walk(target, next);
    }
  };
  for (const r of roots) walk(r, [r]);
  return out;
}
