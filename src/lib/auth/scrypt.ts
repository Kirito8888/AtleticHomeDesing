// Hash de contraseñas.
// v1.7: Argon2id (recomendación de OWASP y del CCN-CERT: m = 19 MiB, t = 2, p = 1), formato PHC
// «$argon2id$v=19$m=…,t=…,p=…$salt$hash». Los hashes scrypt anteriores
// («scrypt$N$r$p$<salt>$<hash>») se siguen aceptando y se rehacen en Argon2id al iniciar sesión.
// Módulo puro (sin "server-only") para poder usarlo también en los scripts de
// administración (prisma/scripts/user-admin.ts).
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

/** Parámetros Argon2id (OWASP 2023, primera opción). Subirlos hace que los hashes viejos se rehagan. */
const ARGON = { algorithm: 2 /* Argon2id */, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export { MIN_PASSWORD_LENGTH } from "./constants";

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password.normalize("NFKC"), ARGON);
}

/** Hash scrypt (formato anterior a la v1.7). Solo para tests de compatibilidad. */
export async function hashPasswordScrypt(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

/** ¿Hay que rehacer el hash con los parámetros actuales? (scrypt o Argon2 con parámetros más bajos). */
export function needsRehash(stored: string): boolean {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored);
  return !m || Number(m[1]) < ARGON.memoryCost || Number(m[2]) < ARGON.timeCost;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$argon2")) {
    try {
      return await argonVerify(stored, password.normalize("NFKC"));
    } catch {
      return false;
    }
  }
  const [algo, n, r, p, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verificación contra un hash ficticio cuando el usuario no existe, para que el
 * tiempo de respuesta no revele qué emails están registrados.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(password, await dummyHash);
  return false;
}

/** Contraseña aleatoria legible (sin caracteres ambiguos) para restablecimientos. */
export function generatePassword(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}
