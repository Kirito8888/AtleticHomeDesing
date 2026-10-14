import "server-only";

import { Pool } from "pg";

/**
 * v2.0 · Cerrojo por tarea entre réplicas (`pg_try_advisory_lock`). Un cerrojo de sesión debe pedirse y
 * soltarse en la MISMA conexión; el pool de Prisma no lo garantiza, así que cada tarea toma una conexión
 * de este pool pequeño y la retiene hasta soltarlo. Si la conexión cae, Postgres libera el cerrojo solo.
 */
const LOCK_CLASS = 20_020; // espacio (int, int): no choca con los pg_advisory_xact_lock(hashtext(...)) de auditoría

const g = globalThis as unknown as { __lifeosLockPool?: Pool };

function pool(): Pool {
  g.__lifeosLockPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2, idleTimeoutMillis: 30_000 });
  return g.__lifeosLockPool;
}

export type LockResult<T> = { ran: true; value: T } | { ran: false };

/** Ejecuta `fn` solo si ninguna otra réplica (ni otra pasada de esta) tiene el cerrojo `name`. */
export async function withJobLock<T>(name: string, fn: () => Promise<T>): Promise<LockResult<T>> {
  const client = await pool().connect();
  let destroy = false;
  try {
    let got: boolean | undefined;
    try {
      got = (await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1, hashtext($2)) as ok", [LOCK_CLASS, name])).rows[0]?.ok;
    } catch (err) {
      destroy = true; // conexión dudosa: no devolverla al pool
      throw err;
    }
    if (!got) return { ran: false };
    try {
      return { ran: true, value: await fn() };
    } finally {
      try {
        const r = await client.query<{ ok: boolean }>("select pg_advisory_unlock($1, hashtext($2)) as ok", [LOCK_CLASS, name]);
        if (!r.rows[0]?.ok) destroy = true;
      } catch {
        destroy = true; // cerrar la conexión suelta el cerrojo
      }
    }
  } finally {
    client.release(destroy);
  }
}
