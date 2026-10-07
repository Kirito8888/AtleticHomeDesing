import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Rutas que no requieren sesión, a propósito. Cualquier ruta nueva sin
// requireUser() hace fallar este test hasta que se justifique aquí.
const PUBLIC_ROUTES = new Set([
  "auth/[...nextauth]/route.ts", // Auth.js
  "auth/register/route.ts", // registro (cerrado salvo ALLOW_REGISTRATION o primer usuario)
  "health/route.ts", // healthcheck de Docker: no devuelve datos de usuarios
  "calendar/ics/[token]/route.ts", // calendario .ics: token de 32 bytes (hash en BD), revocable, sin datos de salud
  "report/[token]/route.ts", // informe para la entrenadora: token de 32 bytes, caduca a los 7 días, revocable
]);

// Las rutas públicas con token deben limitar peticiones y validar el token.
const TOKEN_ROUTES = ["calendar/ics/[token]/route.ts", "report/[token]/route.ts"];

const API = path.resolve(__dirname, "../app/api");

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return routes(p);
    return f === "route.ts" ? [path.relative(API, p)] : [];
  });
}

describe("rutas /api", () => {
  const all = routes(API);

  it("existen (el escaneo funciona)", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it.each(TOKEN_ROUTES.filter((r) => all.includes(r)))("%s (pública con token) limita peticiones", (r) => {
    const src = readFileSync(path.join(API, r), "utf8");
    expect(src).toMatch(/enforceRateLimit\(/);
    expect(src).not.toMatch(/requireUser\(\)/);
  });

  it.each(all.filter((r) => !PUBLIC_ROUTES.has(r)))("%s exige sesión", (r) => {
    const src = readFileSync(path.join(API, r), "utf8");
    expect(src).toMatch(/requireUser\(\)/);
  });
});
