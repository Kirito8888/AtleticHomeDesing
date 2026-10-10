import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");

describe("licencia y autoría", () => {
  it("LICENSE y NOTICE identifican al autor y exigen permiso", () => {
    const license = read("LICENSE");
    expect(license).toContain("Copyright © 2026 David Ornelas Luna");
    expect(license).toMatch(/autorización previa y por escrito/i);
    expect(read("NOTICE")).toContain("David Ornelas Luna");
  });
  it("package.json remite a la licencia", () => {
    const pkg = JSON.parse(read("package.json")) as { license?: string; author?: string };
    expect(pkg.license).toBe("SEE LICENSE IN LICENSE");
    expect(pkg.author).toContain("David Ornelas Luna");
  });
  it("sin el SDK propietario de Garmin", () => {
    const pkg = read("package.json");
    expect(pkg).not.toContain("@garmin/fitsdk");
  });
});
