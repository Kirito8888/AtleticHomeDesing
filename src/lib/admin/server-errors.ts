import "server-only";

import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";

/** Ruta sin identificadores (cuid, uuid, números, tokens largos): /api/training/sessions/[id]. */
export function routePattern(path: string): string {
  return path
    .split("?")[0]
    .split("/")
    .map((seg) => (/^[0-9]+$/.test(seg) || /^c[a-z0-9]{20,}$/.test(seg) || /^[0-9a-f-]{32,}$/i.test(seg) || seg.length > 40 ? "[id]" : seg))
    .join("/")
    .slice(0, 200);
}

/** Mensaje recortado y sin lo que parezca un email o un token (no guardamos datos personales). */
export function scrubMessage(msg: string): string {
  return msg
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/**
 * v1.8 · Errores 500 e informes de la CSP, agregados por tipo, ruta y mensaje (contador y
 * última vez). Nunca rompe la petición que falló: si no se puede guardar, se ignora.
 */
export async function recordServerError(kind: "ERROR" | "CSP", path: string, message: string) {
  const p = kind === "ERROR" ? routePattern(path) : path.slice(0, 200);
  const m = scrubMessage(message);
  const key = createHash("sha256").update(`${kind}|${p}|${m}`).digest("hex");
  try {
    await prisma.serverError.upsert({ where: { key }, create: { key, kind, path: p, message: m }, update: { count: { increment: 1 }, lastAt: new Date() } });
  } catch {
    // sin BD o tabla aún sin migrar: no pasa nada
  }
}

export const recentServerErrors = (take = 20) => prisma.serverError.findMany({ orderBy: { lastAt: "desc" }, take });
