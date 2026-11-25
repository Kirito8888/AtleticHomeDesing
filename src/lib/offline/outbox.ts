"use client";

import { type Draft, type OutboxItem, type OutboxMethod, outcome, outboxId, partitionByOwner, usableDraft, withClientKey } from "@/lib/offline/outbox-core";
import { purgePrivateCaches } from "@/lib/offline/private-cache";

/**
 * Bandeja de salida sin conexión (v1.6): sesiones registradas en la pista sin cobertura.
 * Se guardan en IndexedDB de este dispositivo y se envían al volver la conexión.
 * Cada envío lleva un clientId: si el servidor ya la recibió, no se duplica.
 *
 * v3.2 · Bloque J (V3-N05, «entreno sin red»):
 * - también los cambios de una sesión (PATCH: completar la planificada con sus series), uno por sesión;
 * - cada envío lleva su dueña (`setOutboxOwner`, lo fija `OutboxSync` desde el layout): otra cuenta no lo envía;
 * - borradores del formulario de sesión (`drafts`): cada serie anotada sobrevive a que el móvil cierre la
 *   pestaña; caducan a las 24 h y se borran, con la bandeja, al pulsar «Salir» (`purgeOutbox`).
 */
export type { OutboxItem } from "@/lib/offline/outbox-core";

const DB = "lifeos-outbox";
const STORE = "items";
const DRAFTS = "drafts";
export const OUTBOX_EVENT = "lifeos-outbox";

let currentOwner: string | null = null;
const ownerWaiters: Array<() => void> = [];
/** La cuenta con la sesión abierta en esta pestaña (la fija `OutboxSync` al pintarse). */
export const setOutboxOwner = (owner: string | null) => {
  currentOwner = owner;
  if (owner) for (const w of ownerWaiters.splice(0)) w();
};
/** Espera (como mucho 2 s) a saber de quién es la pestaña: una página puede hidratarse antes que el layout. */
const ownerReady = () =>
  currentOwner
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        ownerWaiters.push(resolve);
        setTimeout(resolve, 2000);
      });

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      if (!d.objectStoreNames.contains(DRAFTS)) d.createObjectStore(DRAFTS, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction(store, mode).objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const changed = () => window.dispatchEvent(new Event(OUTBOX_EVENT));

export async function enqueue(item: Omit<OutboxItem, "createdAt" | "owner">) {
  await ownerReady();
  await tx("readwrite", (s) => s.put({ ...item, owner: currentOwner ?? undefined, createdAt: Date.now() }));
  changed();
}

/** Encola un PATCH de una sesión (gana el último cambio de esa sesión). */
export const enqueuePatch = (key: string, url: string, body: unknown, label: string) => enqueue({ id: outboxId("PATCH", key), method: "PATCH", url, body, label });

const all = () => tx<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);

/** Lo pendiente de la cuenta actual (lo de otra cuenta no se cuenta ni se envía). */
export const pending = async () => partitionByOwner(await all(), currentOwner).send;

let flushing: Promise<{ sent: number; rejected: Array<{ label: string; error: string }> }> | null = null;

/** Envía lo pendiente. Sin red, para y lo deja para más tarde. Devuelve los enviados y los rechazados. */
export function flush(): Promise<{ sent: number; rejected: Array<{ label: string; error: string }> }> {
  // Una sola pasada a la vez en esta pestaña («online», visibilidad y el reintento pueden coincidir)
  flushing ??= doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush() {
  if (!currentOwner) return { sent: 0, rejected: [] }; // sin saber quién es, no se envía ni se borra nada
  const { send, drop } = partitionByOwner(await all(), currentOwner);
  for (const it of drop) await tx("readwrite", (s) => s.delete(it.id));
  let sent = 0;
  const rejected: Array<{ label: string; error: string }> = [];
  for (const it of send) {
    let res: Response;
    try {
      res = await fetch(it.url, { method: it.method ?? "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(it.body) });
    } catch {
      break; // sigue sin red
    }
    if (res.status === 401) void purgePrivateCaches(); // V3-S06
    const o = outcome(res.status);
    if (o === "retry") break; // sesión caducada, límite o servidor: reintentar luego
    if (o === "done") sent++;
    else rejected.push({ label: it.label, error: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${res.status}` });
    await tx("readwrite", (s) => s.delete(it.id));
  }
  if (sent || rejected.length || drop.length) changed();
  return { sent, rejected };
}

/** Borra la bandeja y los borradores de este dispositivo (al pulsar «Salir»). */
export async function purgeOutbox() {
  try {
    await tx("readwrite", (s) => s.clear());
    await tx("readwrite", (s) => s.clear(), DRAFTS);
    changed();
  } catch {
    // sin IndexedDB
  }
}

/** Guarda el borrador del formulario (cada serie anotada). Sin cuenta o sin IndexedDB no hace nada. */
export async function saveDraft(key: string, data: unknown) {
  await ownerReady();
  const owner = currentOwner;
  if (!owner) return;
  try {
    await tx("readwrite", (s) => s.put({ key, owner, savedAt: Date.now(), data } satisfies Draft), DRAFTS);
  } catch {
    // sin IndexedDB (modo privado): el formulario sigue funcionando, sin copia
  }
}

/** El borrador recuperable de esta cuenta; el caducado o ajeno se borra. */
export async function loadDraft(key: string): Promise<Draft | null> {
  await ownerReady();
  try {
    const d = await tx<Draft | undefined>("readonly", (s) => s.get(key) as IDBRequest<Draft | undefined>, DRAFTS);
    if (usableDraft(d, currentOwner)) return d!;
    if (d) await clearDraft(key);
  } catch {
    // sin IndexedDB
  }
  return null;
}

export async function clearDraft(key: string) {
  try {
    await tx("readwrite", (s) => s.delete(key), DRAFTS);
  } catch {
    // sin IndexedDB
  }
}

/** ¿El error es de red (sin conexión) y no del servidor? */
export const isNetworkError = (e: unknown) => e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);

/**
 * v1.7 · Envía y, si no hay red, lo deja en la bandeja (agua, hábitos, comidas). Devuelve «queued»
 * cuando quedó pendiente. Los errores del servidor se lanzan igual que con `api`.
 */
export async function sendOrQueue(url: string, body: unknown, label: string, method: OutboxMethod = "POST", opts: { idempotent?: boolean } = {}): Promise<"sent" | "queued"> {
  // Con `idempotent` la clave nace antes del primer envío: si se pierde la respuesta, el reenvío lleva la misma
  const key = opts.idempotent ? crypto.randomUUID() : null;
  const payload = key ? withClientKey(body, key) : body;
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${res.status}`);
    return "sent";
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await enqueue({ id: key ?? crypto.randomUUID(), url, body: payload, label, method });
    return "queued";
  }
}
