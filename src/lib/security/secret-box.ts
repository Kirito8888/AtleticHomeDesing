// Cifrado simétrico de secretos en la BD (AES-256-GCM, autenticado).
// Formato: "v1:<iv b64>:<tag b64>:<cifrado b64>". La clave (32 bytes en base64)
// viene de una variable de entorno y nunca se guarda en la BD.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyBytes(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("La clave de cifrado debe tener 32 bytes en base64 (openssl rand -base64 32)");
  return key;
}

export function seal(plaintext: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(keyB64), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function open(sealed: string, keyB64: string): string {
  const [v, iv, tag, ct] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Secreto cifrado con formato desconocido");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(keyB64), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
