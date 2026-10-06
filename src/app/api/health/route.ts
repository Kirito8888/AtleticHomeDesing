import { prisma } from "@/lib/prisma";

/**
 * Healthcheck de Docker (docker-compose.yml) y de scripts/update.sh. Público y
 * sin datos: solo dice si la app responde y llega a la base de datos.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
