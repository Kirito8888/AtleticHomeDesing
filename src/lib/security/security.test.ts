import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { generateRecoveryCode, hashRecoveryCode, looksLikeRecoveryCode, normalizeRecoveryCode } from "./recovery-codes";
import { open, seal } from "./secret-box";

describe("secret-box (AES-256-GCM)", () => {
  const key = randomBytes(32).toString("base64");

  it("cifra y descifra; cada cifrado es distinto", () => {
    const a = seal("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", key);
    expect(a).not.toContain("JBSWY3DP");
    expect(a).not.toBe(seal("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", key));
    expect(open(a, key)).toBe("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP");
  });

  it("rechaza una clave distinta o un texto manipulado", () => {
    const a = seal("secreto", key);
    expect(() => open(a, randomBytes(32).toString("base64"))).toThrow();
    const [v, iv, tag, ct] = a.split(":");
    const tampered = Buffer.from(ct, "base64");
    tampered[0] ^= 1;
    expect(() => open([v, iv, tag, tampered.toString("base64")].join(":"), key)).toThrow();
  });

  it("exige una clave de 32 bytes", () => {
    expect(() => seal("x", Buffer.from("corta").toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("códigos de recuperación", () => {
  it("formato XXXX-XXXX-XXXX sin caracteres ambiguos y únicos", () => {
    const codes = new Set(Array.from({ length: 200 }, generateRecoveryCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("el hash ignora mayúsculas, espacios y guiones", () => {
    const c = generateRecoveryCode();
    expect(hashRecoveryCode(c.toLowerCase().replace(/-/g, " "))).toBe(hashRecoveryCode(c));
    expect(normalizeRecoveryCode(" ab-cd ")).toBe("ABCD");
  });

  it("distingue un código de recuperación de un TOTP", () => {
    expect(looksLikeRecoveryCode("ABCD-EFGH-JKMN")).toBe(true);
    expect(looksLikeRecoveryCode("123456")).toBe(false);
  });
});
