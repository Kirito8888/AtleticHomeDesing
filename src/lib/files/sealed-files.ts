import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { dataKey, previousDataKey } from "@/lib/security/data-key";
import { openBytes, sealBytes } from "@/lib/security/secret-box";

/**
 * v1.7 · Ficheros cifrados de cada usuario (fotos de lesión, justificantes). AES-256-GCM con la clave de
 * datos; en la BD solo la ruta relativa a UPLOAD_DIR/<usuario>. Borrar la cuenta borra la carpeta.
 */
export const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/webp": ".webp", "image/png": ".png", "application/pdf": ".pdf" };

/** Firma real del fichero (no lo que dice el navegador). */
export function sniffFile(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.length > 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

export function userFile(userId: string, rel: string) {
  const base = path.resolve(/* turbopackIgnore: true */ env().UPLOAD_DIR, userId);
  const file = path.resolve(/* turbopackIgnore: true */ base, rel);
  if (!file.startsWith(base + path.sep)) throw new ApiError(400, "Ruta no válida");
  return file;
}

export async function writeSealed(userId: string, rel: string, buf: Buffer) {
  const file = userFile(userId, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, sealBytes(buf, dataKey()), { mode: 0o600 });
}

export async function readSealed(userId: string, rel: string) {
  return openBytes(await readFile(userFile(userId, rel)), [dataKey(), previousDataKey()]);
}

export async function removeSealed(userId: string, rels: string[]) {
  for (const rel of rels) if (rel) await rm(userFile(userId, rel), { force: true });
}
