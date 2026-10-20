/**
 * Bloque 8 · Logger JSON mínimo: una línea por evento, sin servicios externos.
 * Solo salen campos de una lista blanca; nunca emails, cuerpos, cabeceras, cookies, tokens ni datos de salud.
 * El único `console` permitido del código está aquí (eslint `no-console`).
 */
import { requestContext } from "@/lib/request-context";
import { anonPath } from "@/lib/admin/metrics";

type Level = "info" | "warn" | "error";
const ALLOWED = ["reqId", "route", "method", "status", "ms", "job", "count", "code", "kind", "err"] as const;
export type LogFields = Partial<Record<"reqId" | "route" | "method" | "job" | "kind", string> & Record<"status" | "ms" | "count", number> & { code: string | number; err: unknown }>;

/** Texto sin lo que pueda ser personal: emails, tokens, JWT, IP, y valores entre comillas o llaves (p. ej. los de Prisma). */
export function scrubText(msg: string, max = 200): string {
  return msg
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [token]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[ip]")
    .replace(/\b(?:[0-9a-f]{0,4}:){3,7}[0-9a-f]{0,4}\b/gi, "[ip]")
    .replace(/\{[^{}]*\}/g, "{…}")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "[…]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Error → solo nombre, código y la primera línea del mensaje saneada (sin stack ni `meta`). */
export function errInfo(err: unknown): { name: string; code?: string | number; message: string } {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return { name: err.name, ...(typeof code === "string" || typeof code === "number" ? { code } : {}), message: scrubText(err.message.split("\n").find((l) => l.trim()) ?? "") };
  }
  return { name: "NonError", message: typeof err === "string" ? scrubText(err.split("\n")[0]) : "" };
}

export function formatLine(level: Level, msg: string, fields: Record<string, unknown> = {}, now = new Date()): string {
  const rc = requestContext.getStore();
  const merged: Record<string, unknown> = { reqId: rc?.reqId, route: rc ? anonPath(rc.path) : undefined, method: rc?.method, ...fields };
  const out: Record<string, unknown> = { t: now.toISOString(), level, msg: scrubText(msg) };
  for (const k of ALLOWED) {
    const v = merged[k];
    if (v === undefined) continue;
    if (k === "err") out.err = errInfo(v);
    else if (typeof v === "number") out[k] = v;
    else if (typeof v === "string") out[k] = scrubText(v, 160);
  }
  return JSON.stringify(out);
}

const emit = (level: Level, msg: string, fields?: LogFields) => {
  const line = formatLine(level, msg, fields as Record<string, unknown>);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
};


export const log = {
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};
