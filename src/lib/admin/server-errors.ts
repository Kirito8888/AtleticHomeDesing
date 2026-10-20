import "server-only";

import { createHash } from "node:crypto";

import { anonPath } from "@/lib/admin/metrics";
import { scrubText } from "@/lib/log";
import { prisma } from "@/lib/prisma";

export const routePattern = (path: string): string => anonPath(path, 200);

/** Mensaje sin datos personales ni valores (emails, tokens, IP, lo que vaya entre comillas o llaves). */
export const scrubMessage = (msg: string): string => scrubText(msg, 300);

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
