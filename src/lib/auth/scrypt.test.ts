import { describe, expect, it } from "vitest";

import { generatePassword, hashPassword, verifyAgainstDummy, verifyPassword } from "./scrypt";

describe("scrypt", () => {
  it("verifica la contraseña correcta y rechaza la incorrecta", async () => {
    const h = await hashPassword("una-contraseña-larga");
    expect(h.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("una-contraseña-larga", h)).toBe(true);
    expect(await verifyPassword("otra", h)).toBe(false);
  });
  it("rechaza formatos desconocidos", async () => {
    expect(await verifyPassword("x", "bcrypt$abc")).toBe(false);
  });
  it("la verificación ficticia siempre falla", async () => {
    expect(await verifyAgainstDummy("lo-que-sea")).toBe(false);
  });
  it("genera contraseñas sin caracteres ambiguos", () => {
    const p = generatePassword(20);
    expect(p).toHaveLength(20);
    expect(p).not.toMatch(/[0O1lI]/);
  });
});
