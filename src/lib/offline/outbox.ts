"use client";

/**
 * Bandeja de salida sin conexión (v1.6): sesiones registradas en la pista sin cobertura.
 * Se guardan en IndexedDB de este dispositivo y se envían al volver la conexión.
 * Cada envío lleva un clientId: si el servidor ya la recibió, no se duplica.
 */
export type OutboxItem = { id: string; url: string; body: unknown; label: string; createdAt: number };

const DB = "lifeos-outbox";
const STORE = "items";
export const OUTBOX_EVENT = "lifeos-outbox";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

const changed = () => window.dispatchEvent(new Event(OUTBOX_EVENT));

export async function enqueue(item: Omit<OutboxItem, "createdAt">) {
  await tx("readwrite", (s) => s.put({ ...item, createdAt: Date.now() }));
  changed();
}

export const pending = () => tx<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);

/** Envía lo pendiente. Sin red, para y lo deja para más tarde. Devuelve los enviados y los rechazados. */
export async function flush(): Promise<{ sent: number; rejected: Array<{ label: string; error: string }> }> {
  const items = (await pending()).sort((a, b) => a.createdAt - b.createdAt);
  let sent = 0;
  const rejected: Array<{ label: string; error: string }> = [];
  for (const it of items) {
    let res: Response;
    try {
      res = await fetch(it.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(it.body) });
    } catch {
      break; // sigue sin red
    }
    if (res.status === 401 || res.status === 429 || res.status >= 500) break; // sesión caducada o servidor: reintentar luego
    if (res.ok) sent++;
    else rejected.push({ label: it.label, error: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${res.status}` });
    await tx("readwrite", (s) => s.delete(it.id));
  }
  if (sent || rejected.length) changed();
  return { sent, rejected };
}

/** ¿El error es de red (sin conexión) y no del servidor? */
export const isNetworkError = (e: unknown) => e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
