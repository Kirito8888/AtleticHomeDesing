/**
 * v3.2 · Bloque J (V3-N05): reglas puras de la bandeja sin conexión (sin IndexedDB, con tests).
 *
 * Idempotencia de las series de fuerza: no tienen clave propia. Viajan dentro de la sesión, así que
 * - una sesión nueva lleva `clientId` (único por usuaria en la BD): reenviarla no crea otra;
 * - completar o editar una sesión es un PATCH que sustituye todas sus series: reenviarlo deja lo mismo.
 * Por eso no hace falta esquema ni migración.
 */

export type OutboxMethod = "POST" | "PATCH";

export type OutboxItem = {
  id: string;
  url: string;
  body: unknown;
  label: string;
  createdAt: number;
  /** v3.2 J · Ausente en lo guardado antes de v3.2 (se trata como POST). */
  method?: OutboxMethod;
  /** v3.2 J · Usuaria que lo anotó; otra cuenta en el mismo dispositivo nunca lo envía. */
  owner?: string;
};

export type Draft = { key: string; owner: string; savedAt: number; data: unknown };

/** Los borradores del formulario caducan como las copias privadas del SW (V3-S06). */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Qué se envía y qué se borra sin enviar. Lo de otra cuenta se borra: enviarlo con la sesión actual
 * lo escribiría en la cuenta equivocada. Lo antiguo sin dueña se envía (compatibilidad con v1.6–v3.1).
 */
export function partitionByOwner(items: OutboxItem[], owner: string | null): { send: OutboxItem[]; drop: OutboxItem[] } {
  const send: OutboxItem[] = [];
  const drop: OutboxItem[] = [];
  for (const it of items) {
    if (it.owner && (!owner || it.owner !== owner)) drop.push(it);
    else send.push(it);
  }
  send.sort((a, b) => a.createdAt - b.createdAt);
  return { send, drop };
}

/**
 * Qué hacer según la respuesta. `retry` = se para y se intenta más tarde (sin red, sesión caducada,
 * límite o servidor caído); `done` = enviado; `reject` = el servidor no lo acepta y no lo aceptará.
 */
export function outcome(status: number | null): "retry" | "done" | "reject" {
  if (status == null || status === 401 || status === 408 || status === 429 || status >= 500) return "retry";
  return status >= 200 && status < 300 ? "done" : "reject";
}

/** Id de la cola: una sesión nueva por su clientId; los cambios de una sesión, uno por sesión (gana el último). */
export const outboxId = (method: OutboxMethod, key: string) => (method === "PATCH" ? `patch:${key}` : key);

/** ¿Se puede recuperar este borrador? Solo de la misma cuenta y con menos de 24 h. */
export function usableDraft(d: Draft | undefined | null, owner: string | null, now = Date.now()): boolean {
  if (!d || !owner || d.owner !== owner) return false;
  const age = now - d.savedAt;
  return age >= -60_000 && age < DRAFT_TTL_MS;
}
