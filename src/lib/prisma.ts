import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Singleton: evita abrir un pool nuevo en cada hot-reload de `next dev`.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL no está definida (ver .env.example)");
    }
    // Pool pequeño (v1.7): una sola app en un servidor modesto; la BD admite pocas conexiones.
    const max = Math.max(1, Math.min(50, Number(process.env.DB_POOL_MAX) || 5));
    globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max, idleTimeoutMillis: 30_000 }) });
  }
  return globalForPrisma.prisma;
}

/**
 * Cliente perezoso: se crea en el primer acceso, no al importar el módulo.
 * `next build` importa los route handlers para recopilar su configuración, y
 * en `docker build` no hay DATABASE_URL (ni debe haberla: no hay secretos en
 * la imagen).
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
