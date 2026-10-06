import { NextResponse } from "next/server";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createSessionSchema } from "@/lib/training/schemas";

const MAX_TEMPLATES = 50;

export const GET = route(async () => {
  const user = await requireUser();
  return prisma.sessionTemplate.findMany({
    where: { userId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, updatedAt: true },
  });
});

/** Guarda (o sobrescribe, mismo nombre) una plantilla: el cuerpo de una sesión sin la fecha. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { name, payload } = await parseBody(req, z.object({ name: z.string().trim().min(1).max(80), payload: z.record(z.string(), z.unknown()) }));
  // Se valida como si fuera una sesión real: una plantilla rota no se guarda.
  const parsed = createSessionSchema.safeParse({ ...payload, date: "2000-01-01" });
  if (!parsed.success) throw new ApiError(400, "La plantilla no es una sesión válida", parsed.error.issues);
  const { date: _date, ...clean } = parsed.data;
  void _date;
  const exists = await prisma.sessionTemplate.findUnique({ where: { userId_name: { userId: user.id, name } }, select: { id: true } });
  if (!exists && (await prisma.sessionTemplate.count({ where: { userId: user.id } })) >= MAX_TEMPLATES) {
    throw new ApiError(400, `Máximo ${MAX_TEMPLATES} plantillas`);
  }
  const data = { type: clean.type, payload: clean as Prisma.InputJsonValue };
  const tpl = await prisma.sessionTemplate.upsert({
    where: { userId_name: { userId: user.id, name } },
    create: { userId: user.id, name, ...data },
    update: data,
    select: { id: true, name: true, type: true },
  });
  return NextResponse.json(tpl, { status: exists ? 200 : 201 });
});
