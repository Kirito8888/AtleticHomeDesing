import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * La imagen «migrate» (npm run user, seed) solo lleva prisma/ y los ficheros de src/ que copia el
 * Dockerfile a mano. Si un script de prisma/ importa algo más de src/, la imagen falla en el servidor.
 */
describe("imagen migrate del Dockerfile", () => {
  const root = path.resolve(__dirname, "../..");
  const docker = readFileSync(path.join(root, "Dockerfile"), "utf8");
  const scripts = [path.join(root, "prisma/seed.ts"), ...readdirSync(path.join(root, "prisma/scripts")).map((f) => path.join(root, "prisma/scripts", f))];

  it("copia todo lo que los scripts importan de src/ (salvo el cliente generado)", () => {
    const missing: string[] = [];
    for (const file of scripts.filter((f) => f.endsWith(".ts"))) {
      for (const m of readFileSync(file, "utf8").matchAll(/from "(\.\.\/[^"]*src\/[^"]+)"/g)) {
        const rel = path.relative(root, path.resolve(path.dirname(file), m[1]));
        if (rel.startsWith("src/generated/")) continue;
        if (!docker.includes(`${rel}.ts`)) missing.push(`${path.relative(root, file)} → ${rel}.ts`);
        else {
          // Lo copiado solo puede importar otros ficheros que también se copien
          const src = readFileSync(path.join(root, `${rel}.ts`), "utf8");
          for (const d of src.matchAll(/from "((?:@\/|\.)[^"]+)"/g)) {
            const dep = d[1].startsWith("@/") ? `src/${d[1].slice(2)}` : path.relative(root, path.resolve(path.dirname(path.join(root, rel)), d[1]));
            if (!docker.includes(`${dep}.ts`)) missing.push(`${rel}.ts → ${dep}.ts`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
