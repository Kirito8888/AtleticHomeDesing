import { describe, expect, it } from "vitest";

import { generatePassword, hashPassword, hashPasswordScrypt, needsRehash, verifyAgainstDummy, verifyPassword } from "./scrypt";

describe("contraseñas (Argon2id, con scrypt heredado)", () => {
  it("verifica la contraseña correcta y rechaza la incorrecta", async () => {
    const h = await hashPassword("una-contraseña-larga");
    expect(h.startsWith("$argon2id$v=19$m=19456,t=2,p=1$")).toBe(true);
    expect(await verifyPassword("una-contraseña-larga", h)).toBe(true);
    expect(await verifyPassword("otra", h)).toBe(false);
    expect(needsRehash(h)).toBe(false);
  });
  it("acepta los hashes scrypt anteriores y pide rehacerlos", async () => {
    const old = await hashPasswordScrypt("una-contraseña-larga");
    expect(old.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(await verifyPassword("una-contraseña-larga", old)).toBe(true);
    expect(await verifyPassword("otra", old)).toBe(false);
    expect(needsRehash(old)).toBe(true);
    expect(needsRehash("$argon2id$v=19$m=4096,t=1,p=1$abc$def")).toBe(true);
  });
  it("un hash Argon2 corrupto no lanza: devuelve false", async () => {
    expect(await verifyPassword("x", "$argon2id$v=19$m=19456,t=2,p=1$roto")).toBe(false);
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
