/** Estado de salud de `/api/health` (lógica pura; las consultas viven en la ruta). */
export const QUEUE_STUCK_MIN = 15;

export type QueueCounts = { stuck: number; failed24h: number };
export type Health = { status: "ok" | "degradado" | "caído"; db: boolean; queue: "ok" | "atascada" | "fallos" | "ilegible" };

/** `queue` null = no se pudo leer; la cola vacía o sin crear es normal. */
export function healthStatus(db: boolean, queue: QueueCounts | null): Health {
  if (!db) return { status: "caído", db: false, queue: "ilegible" };
  if (!queue) return { status: "degradado", db: true, queue: "ilegible" };
  if (queue.stuck > 0) return { status: "degradado", db: true, queue: "atascada" };
  if (queue.failed24h > 0) return { status: "degradado", db: true, queue: "fallos" };
  return { status: "ok", db: true, queue: "ok" };
}
