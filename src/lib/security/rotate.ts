import "server-only";

import { readFile, writeFile } from "node:fs/promises";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { photoFile } from "@/lib/recovery/wellbeing-service";
import { openAny, openBytes, seal, sealBytes } from "@/lib/security/secret-box";

import { dataKey, previousDataKey } from "./data-key";

/**
 * v1.7 · Rotación de claves. Pasos (manual de despliegue):
 *  1. Pon la clave vieja en DATA_ENCRYPTION_KEY_PREVIOUS (y/o TOTP_ENCRYPTION_KEY_PREVIOUS) y una nueva
 *     en DATA_ENCRYPTION_KEY (TOTP_ENCRYPTION_KEY); reinicia. La app lee con las dos.
 *  2. Estado del servidor → «Volver a cifrar»: todo lo cifrado pasa a la clave nueva.
 *  3. Quita las *_PREVIOUS y reinicia.
 * Por lotes, cada fila en su propia escritura: si algo falla a mitad, se puede repetir sin daño.
 */
type Table = { name: string; read: (skip: number) => Promise<Array<{ id: string; data: string | null }>>; write: (id: string, data: string) => Promise<unknown> };

const BATCH = 200;
const tables: Table[] = [
  { name: "ciclo (ajustes)", read: (skip) => prisma.cycleProfile.findMany({ select: { userId: true, data: true }, skip, take: BATCH, orderBy: { userId: "asc" } }).then((r) => r.map((x) => ({ id: x.userId, data: x.data }))), write: (userId, data) => prisma.cycleProfile.update({ where: { userId }, data: { data } }) },
  { name: "ciclo (días)", read: (skip) => prisma.cycleLog.findMany({ select: { id: true, data: true }, skip, take: BATCH, orderBy: { id: "asc" } }), write: (id, data) => prisma.cycleLog.update({ where: { id }, data: { data } }) },
  { name: "salud de la mujer", read: (skip) => prisma.womenHealth.findMany({ select: { userId: true, data: true }, skip, take: BATCH, orderBy: { userId: "asc" } }).then((r) => r.map((x) => ({ id: x.userId, data: x.data }))), write: (userId, data) => prisma.womenHealth.update({ where: { userId }, data: { data } }) },
  { name: "registros de salud", read: (skip) => prisma.healthLog.findMany({ select: { id: true, data: true }, skip, take: BATCH, orderBy: { id: "asc" } }), write: (id, data) => prisma.healthLog.update({ where: { id }, data: { data } }) },
  { name: "bienestar", read: (skip) => prisma.wellbeingLog.findMany({ select: { id: true, data: true }, skip, take: BATCH, orderBy: { id: "asc" } }), write: (id, data) => prisma.wellbeingLog.update({ where: { id }, data: { data } }) },
  { name: "entreno sola", read: (skip) => prisma.safetyTrip.findMany({ where: { data: { not: null } }, select: { id: true, data: true }, skip, take: BATCH, orderBy: { id: "asc" } }), write: (id, data) => prisma.safetyTrip.update({ where: { id }, data: { data } }) },
];

async function rotateTables(list: Table[], keys: [string, string | undefined]) {
  const out: Record<string, { rotated: number; current: number; failed: number }> = {};
  for (const t of list) {
    const r = { rotated: 0, current: 0, failed: 0 };
    for (let skip = 0; ; skip += BATCH) {
      const rows = await t.read(skip);
      for (const row of rows) {
        if (!row.data) continue;
        try {
          const { plaintext, keyIndex } = openAny(row.data, keys);
          if (keyIndex === 0) r.current++;
          else {
            await t.write(row.id, seal(plaintext, keys[0]));
            r.rotated++;
          }
        } catch {
          r.failed++;
        }
      }
      if (rows.length < BATCH) break;
    }
    out[t.name] = r;
  }
  return out;
}

/** Fotos de lesión: el fichero entero se vuelve a cifrar si solo abre con la clave anterior. */
async function rotatePhotos(keys: [string, string | undefined]) {
  const r = { rotated: 0, current: 0, failed: 0 };
  for (const p of await prisma.injuryPhoto.findMany({ select: { userId: true, path: true } })) {
    try {
      const file = photoFile(p.userId, p.path);
      const blob = await readFile(file);
      try {
        openBytes(blob, [keys[0]]);
        r.current++;
      } catch {
        await writeFile(file, sealBytes(openBytes(blob, [keys[1]]), keys[0]), { mode: 0o600 });
        r.rotated++;
      }
    } catch {
      r.failed++;
    }
  }
  return r;
}

export async function reencryptAll() {
  const keys: [string, string | undefined] = [dataKey(), previousDataKey()];
  const data: Record<string, { rotated: number; current: number; failed: number }> = { ...(await rotateTables(tables, keys)), "fotos de lesión": await rotatePhotos(keys) };
  const totpKey = env().TOTP_ENCRYPTION_KEY;
  const totp = totpKey
    ? await rotateTables(
        [
          {
            name: "2FA",
            read: (skip) => prisma.user.findMany({ where: { totpSecret: { not: null } }, select: { id: true, totpSecret: true }, skip, take: BATCH, orderBy: { id: "asc" } }).then((r) => r.map((u) => ({ id: u.id, data: u.totpSecret }))),
            write: (id, s) => prisma.user.update({ where: { id }, data: { totpSecret: s } }),
          },
        ],
        [totpKey, env().TOTP_ENCRYPTION_KEY_PREVIOUS],
      )
    : {};
  return { ...data, ...totp };
}
