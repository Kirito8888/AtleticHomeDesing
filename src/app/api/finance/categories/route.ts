import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const GET = route(async () => {
  const user = await requireUser();
  return prisma.financialCategory.findMany({ where: { userId: user.id }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
});

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["INCOME", "EXPENSE"]),
  parentId: z.string().nullish(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
  icon: z.string().max(40).nullish(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const data = await parseBody(req, schema);
  if (data.parentId) {
    await prisma.financialCategory.findFirstOrThrow({ where: { id: data.parentId, userId: user.id } });
  }
  return NextResponse.json(await prisma.financialCategory.create({ data: { ...data, userId: user.id } }), { status: 201 });
});
