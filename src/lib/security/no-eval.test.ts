import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe("sin eval en el código propio (la CSP no admite 'unsafe-eval')", () => {
  it("ningún fichero de src usa eval( ni new Function", () => {
    const bad = files("src").filter((f) => /(^|[^.\w])eval\s*\(|new\s+Function\s*\(/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });

  it("el cliente desactiva la compilación de zod (hace Function(\"\") y viola la CSP)", async () => {
    delete (globalThis as { __zod_globalConfig?: unknown }).__zod_globalConfig;
    await import("../../instrumentation-client");
    expect((globalThis as { __zod_globalConfig?: { jitless?: boolean } }).__zod_globalConfig?.jitless).toBe(true);
  });
});
