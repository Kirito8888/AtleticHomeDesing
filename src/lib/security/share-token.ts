import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens de enlaces de solo lectura (calendario .ics, informe para la entrenadora):
 * 32 bytes aleatorios; en la BD solo se guarda su SHA-256.
 */
export function newShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Formato válido (43 caracteres base64url): evita consultas con basura. */
export function isShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
