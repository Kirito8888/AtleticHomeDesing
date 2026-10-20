import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

const SECRET = "x".repeat(40);
const PROD = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://lifeos:una-clave-larga@db:5432/lifeos?schema=public",
  AUTH_SECRET: SECRET,
  AUTH_URL: "https://atlenza.example.org",
};

describe("env · valores inseguros en producción", () => {
  it("una configuración correcta pasa", () => {
    expect(parseEnv(PROD).AUTH_URL).toBe("https://atlenza.example.org");
  });

  it.each([
    ["AUTH_SECRET ausente", { AUTH_SECRET: undefined }, /AUTH_SECRET/],
    ["AUTH_SECRET corto", { AUTH_SECRET: "corto" }, /AUTH_SECRET/],
    ["AUTH_SECRET de ejemplo", { AUTH_SECRET: "change-me" }, /AUTH_SECRET/],
    ["AUTH_URL ausente", { AUTH_URL: undefined }, /AUTH_URL/],
    ["AUTH_URL sin https", { AUTH_URL: "http://atlenza.example.org" }, /https/],
    ["contraseña de BD de ejemplo", { DATABASE_URL: "postgresql://lifeos:change-me@db:5432/lifeos" }, /DATABASE_URL/],
  ])("rechaza: %s", (_n, over, msg) => {
    expect(() => parseEnv({ ...PROD, ...over })).toThrow(msg);
  });

  it("junta todos los problemas en un solo error", () => {
    expect(() => parseEnv({ ...PROD, AUTH_SECRET: "x", AUTH_URL: "http://a.example.org" })).toThrow(/AUTH_URL[\s\S]*AUTH_SECRET/);
  });

  it("en desarrollo y en pruebas no exige nada de esto", () => {
    expect(() => parseEnv({ ...PROD, NODE_ENV: "development", AUTH_SECRET: "x", AUTH_URL: "http://a.example.org" })).not.toThrow();
    expect(() => parseEnv({ DATABASE_URL: "postgresql://u:change-me@localhost/db" })).not.toThrow();
  });

  it("con AUTH_URL en localhost (CI, E2E) no se exige, aunque sea producción", () => {
    expect(() => parseEnv({ ...PROD, AUTH_SECRET: "veinte-caracteres-ok", AUTH_URL: "http://localhost:3000" })).not.toThrow();
    expect(() => parseEnv({ ...PROD, AUTH_URL: "http://127.0.0.1:3100" })).not.toThrow();
  });

  it("durante `next build` no se valida (aún no hay variables de servidor)", () => {
    expect(() => parseEnv({ ...PROD, NEXT_PHASE: "phase-production-build", AUTH_SECRET: undefined, AUTH_URL: undefined })).not.toThrow();
  });

  it("el formato sigue validándose siempre", () => {
    expect(() => parseEnv({ DATABASE_URL: "x", TOTP_ENCRYPTION_KEY: "no-es-base64-de-32-bytes" })).toThrow(/TOTP_ENCRYPTION_KEY/);
  });
});
