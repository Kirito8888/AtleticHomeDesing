import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

// v3.0 D · V3-S07: el clic en una notificación solo abre rutas propias.
const src = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
const fn = /function safeNotificationPath\(raw\) \{[\s\S]*?\n\}\n/.exec(src)?.[0];

function run(raw: unknown): string {
  const ctx = vm.createContext({ self: { location: { origin: "https://app.example" } }, URL, raw });
  return vm.runInContext(`${fn}\nsafeNotificationPath(raw)`, ctx) as string;
}

describe("sw.js · safeNotificationPath", () => {
  it("existe", () => expect(fn).toBeTruthy());
  it("deja pasar rutas propias, con consulta y ancla", () => {
    for (const p of ["/", "/training/abc", "/study?x=1#y"]) expect(run(p)).toBe(p);
  });
  it("rechaza «//», barras invertidas, URL absolutas, esquemas y vacíos", () => {
    for (const p of ["//evil.com", "/\\evil.com", "/a\\b", "https://evil.com", "javascript:alert(1)", "", undefined, null, 5]) expect(run(p), String(p)).toBe("/");
  });
});
