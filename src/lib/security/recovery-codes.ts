// Códigos de recuperación de 2FA: 10 códigos de un solo uso, ~60 bits cada uno.
// Se muestran una vez y se guarda solo su SHA-256 (con esa entropía, un hash
// rápido basta; el login además está limitado por IP y por cuenta).
import { createHash, randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I/L
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCode(): string {
  const chars = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/** Normaliza lo que teclea el usuario: mayúsculas, sin espacios ni guiones. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** ¿Parece un código de recuperación (12 caracteres) en vez de un TOTP de 6 dígitos? */
export const looksLikeRecoveryCode = (input: string) => normalizeRecoveryCode(input).length === 12;
