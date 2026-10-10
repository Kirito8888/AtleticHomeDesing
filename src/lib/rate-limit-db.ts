import "server-only";

import { prisma } from "@/lib/prisma";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";

/**
 * v1.8 · Límite persistente (ventana fija en Postgres) para lo que protege cuentas: inicio de sesión,
 * llaves de acceso, registro y comprobación de contraseña. Sobrevive a reinicios y actualizaciones
 * (antes, reiniciar la web ponía el contador a cero). Si la BD no responde, usa el de memoria.
 */
export async function rateLimitPersistent(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitHit" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitHit"."count" + 1
      RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 1);
    if (count > limit) return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)) };
    return { ok: true, remaining: limit - count, retryAfterSec: 0 };
  } catch {
    return rateLimit(key, limit, windowMs, now);
  }
}

/** Ventanas viejas (lo llama el job de conservación). */
export const pruneRateLimits = (now = new Date()) => prisma.rateLimitHit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 3600_000) } } });
