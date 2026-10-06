import { NextResponse } from "next/server";
import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { bankMappingSchema } from "@/lib/finance/bank-import";
import { prisma } from "@/lib/prisma";

/** Mapeos de columnas guardados por banco, para no repetirlos cada mes. */
export const GET = route(async () => {
  const user = await requireUser();
  return prisma.bankImportProfile.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(60), accountId: z.string(), mapping: bankMappingSchema }));
  const acc = await prisma.financialAccount.count({ where: { id: body.accountId, userId: user.id } });
  if (!acc) throw new ApiError(404, "Cuenta no encontrada");
  const data = { accountId: body.accountId, mapping: body.mapping as Prisma.InputJsonValue };
  const p = await prisma.bankImportProfile.upsert({
    where: { userId_name: { userId: user.id, name: body.name } },
    create: { userId: user.id, name: body.name, ...data },
    update: data,
  });
  return NextResponse.json(p, { status: 201 });
});

export const DELETE = route(async (req) => {
  const user = await requireUser();
  const { id } = await parseBody(req, z.object({ id: z.string() }));
  const { count } = await prisma.bankImportProfile.deleteMany({ where: { id, userId: user.id } });
  if (!count) throw new ApiError(404, "No encontrado");
  return { ok: true };
});
