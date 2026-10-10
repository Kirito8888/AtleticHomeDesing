import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { recordRequest } from "@/lib/admin/metrics";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
    public headers?: HeadersInit,
  ) {
    super(message);
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<unknown>;

/**
 * Envuelve un Route Handler: serializa el resultado a JSON y traduce errores
 * conocidos (validación, ApiError, Prisma) a códigos HTTP coherentes.
 */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    const t0 = performance.now();
    let res: Response;
    try {
      const result = await fn(req, ctx);
      res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (err) {
      res = errorResponse(err);
      // v1.8 · Los 500 quedan registrados (agregados, sin datos) para «Estado del servidor»
      if (res.status >= 500) void import("@/lib/admin/server-errors").then((m) => m.recordServerError("ERROR", req.nextUrl.pathname, err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
    }
    // v1.9 · Métricas internas (en memoria) para el panel de administración
    recordRequest(req.method, req.nextUrl.pathname, res.status, performance.now() - t0);
    return res;
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status, headers: err.headers });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Datos no válidos", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return NextResponse.json({ error: "Ya existe un registro con esos datos" }, { status: 409 });
    if (err.code === "P2025") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (err.code === "P2003") return NextResponse.json({ error: "Referencia a un registro inexistente" }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}

/**
 * Cuerpo de un PATCH: valida y devuelve SOLO las claves que vienen. En zod 4,
 * `.partial()` sigue aplicando los `.default()` y un parse normal pisaría con
 * valores por defecto lo que no se envió (p. ej. la prioridad de una tarea).
 */
export async function parsePatchBody<T extends z.ZodType>(req: Request, schema: T): Promise<Partial<z.infer<T>>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new ApiError(400, "El cuerpo debe ser JSON válido");
  }
  const parsed = schema.parse(data) as Record<string, unknown>;
  const keys = data && typeof data === "object" ? Object.keys(data) : [];
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => keys.includes(k))) as Partial<z.infer<T>>;
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new ApiError(400, "El cuerpo debe ser JSON válido");
  }
  return schema.parse(data);
}

export function parseQuery<T extends z.ZodType>(req: NextRequest, schema: T): z.infer<T> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}

/** Aplica un límite de `LIMITS` a `key` (usuario o IP); si se supera, 429 con Retry-After. */
export function enforceRateLimit(bucket: keyof typeof LIMITS, key: string): void {
  const { limit, windowMs } = LIMITS[bucket];
  const r = rateLimit(`${bucket}:${key}`, limit, windowMs);
  if (!r.ok) {
    throw new ApiError(429, "Demasiadas peticiones, espera unos minutos", { retryAfterSec: r.retryAfterSec }, {
      "Retry-After": String(r.retryAfterSec),
    });
  }
}
