import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type z } from "zod";

import { Prisma } from "@/generated/prisma/client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
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
    try {
      const result = await fn(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
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
