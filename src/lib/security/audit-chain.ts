// v1.7 · Registro de auditoría encadenado (puro). Cada evento guarda el HMAC-SHA256 de sus campos y del
// hash del evento anterior del mismo usuario. Quien pueda escribir en la BD pero no conozca la clave
// (derivada de AUTH_SECRET, que no está en la BD) no puede borrar, cambiar ni intercalar eventos sin que
// se note. Al borrar los antiguos por conservación, el primero que queda hace de ancla.
import { createHmac, hkdfSync } from "node:crypto";

export type ChainFields = { userId: string; type: string; ip: string | null; userAgent: string | null; detail: string | null; createdAt: Date };

export const chainKey = (secret: string) => Buffer.from(hkdfSync("sha256", secret, "lifeos", "audit-chain-v1", 32));

export function eventHash(key: Buffer, prevHash: string | null, e: ChainFields): string {
  const payload = JSON.stringify([prevHash ?? "", e.userId, e.type, e.ip ?? "", e.userAgent ?? "", e.detail ?? "", e.createdAt.toISOString()]);
  return createHmac("sha256", key).update(payload).digest("hex");
}

/**
 * Comprueba la cadena de un usuario (eventos en orden de creación). Los eventos sin hash (anteriores a
 * la v1.7) se ignoran. Devuelve el primer evento roto, si lo hay.
 */
export function verifyChain(key: Buffer, events: Array<ChainFields & { id: string; prevHash: string | null; hash: string | null }>) {
  let prev: string | null = null;
  let checked = 0;
  for (const e of events) {
    if (!e.hash) continue;
    if (prev !== null && e.prevHash !== prev) return { ok: false as const, checked, brokenAt: e.id, reason: "falta un evento o se cambió el orden" };
    if (eventHash(key, e.prevHash, e) !== e.hash) return { ok: false as const, checked, brokenAt: e.id, reason: "el evento se modificó" };
    prev = e.hash;
    checked++;
  }
  return { ok: true as const, checked };
}
