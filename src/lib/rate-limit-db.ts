import "server-only";

import { createHash, createHmac } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { rateLimit, type RateLimitResult } from "@/lib/rate-limit";

/**
 * v1.8 · Límite persistente (ventana fija en Postgres) para lo que protege cuentas: inicio de sesión,
 * llaves de acceso, registro y comprobación de contraseña. Sobrevive a reinicios y actualizaciones
 * (antes, reiniciar la web ponía el contador a cero) y es común a todas las réplicas (el INSERT … ON CONFLICT
 * es atómico). La clave (IP, id de usuario) se guarda con HMAC, nunca en claro. Ventana fija. Si la BD no
 * responde, usa el de memoria.
 */
export const hashKey = (key: string) => {
  const secret = process.env.AUTH_SECRET;
  return secret ? createHmac("sha256", secret).update(key).digest("hex") : createHash("sha256").update(key).digest("hex");
};

export async function rateLimitPersistent(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitHit" ("key", "windowStart", "count") VALUES (${hashKey(key)}, ${windowStart}, 1)
      ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitHit"."count" + 1
      RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 1);
    if (count > limit) return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000)) };
    return { ok: true, remaining: limit - count, retryAfterSec: 0 };
  } catch {
    return rateLimit(key, limit, windowMs, now);
  }
}

/**
 * Recuento sin sumar, como ventana deslizante aproximada: ventana actual + la anterior ponderada por lo que le queda
 * de vida. Evita que unos fallos repartidos a ambos lados del cambio de ventana fija duplicaran el cupo.
 * Devuelve 0 si la BD no responde.
 */
export async function countPersistent(key: string, windowMs: number, now = Date.now()): Promise<number> {
  const cur = Math.floor(now / windowMs) * windowMs;
  const hashed = hashKey(key);
  try {
    const rows = await prisma.rateLimitHit.findMany({
      where: { key: hashed, windowStart: { in: [new Date(cur), new Date(cur - windowMs)] } },
      select: { windowStart: true, count: true },
    });
    const current = rows.find((r) => r.windowStart.getTime() === cur)?.count ?? 0;
    const previous = rows.find((r) => r.windowStart.getTime() === cur - windowMs)?.count ?? 0;
    return Math.ceil(current + previous * (1 - (now - cur) / windowMs));
  } catch {
    return 0;
  }
}

/** Borra los contadores de una clave (inicio de sesión correcto, desbloqueo por la administración). */
export const resetPersistent = (key: string) => prisma.rateLimitHit.deleteMany({ where: { key: hashKey(key) } });

/** Ventanas viejas (lo llama el job de conservación). */
export const pruneRateLimits = (now = new Date()) => prisma.rateLimitHit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 3600_000) } } });
