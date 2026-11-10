import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

/** La composición corporal es salud cifrada: nada de IA, entrenadora, informe semanal ni .ics la toca. */
describe("aislamiento de la composición corporal", () => {
  const PATTERN = /health\/isak|bodyComposition|isak-service/;
  const all = files("src").filter((f) => !f.startsWith("src/generated/"));
  const isolated = all.filter((f) => /(^|\/)(ai|ai-plan|coach|calendar|ics)(\/|-|\.)/.test(f.replace("src/lib/", "").replace("src/app/api/", "")) || /weekly|report|\.ics|prompt/.test(f));

  it("hay ficheros de IA/coach/informe que vigilar", () => {
    expect(isolated.length).toBeGreaterThan(5);
  });
  it("ninguno de ellos la importa ni la consulta", () => {
    const bad = isolated.filter((f) => PATTERN.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
  it("solo la usan su servicio, sus rutas, la página, la exportación/restauración y la rotación", () => {
    const users = all.filter((f) => PATTERN.test(readFileSync(f, "utf8")) && !/health\/isak/.test(f));
    expect(users.sort()).toEqual(
      [
        "src/app/api/health/body-composition/import/route.ts",
        "src/app/api/health/body-composition/route.ts",
        "src/app/api/health/body-composition/preview/route.ts",
        "src/lib/account/restore.ts",
        "src/lib/account/service.ts",
        "src/lib/security/rotate.ts",
        "src/app/(app)/nutrition/composition/page.tsx",
        "src/components/nutrition/body-composition-import.tsx",
        "src/components/nutrition/body-composition.tsx",
      ].sort(),
    );
  });
});
