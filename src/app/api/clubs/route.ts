import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createOrg } from "@/lib/clubs/service";
import { prisma } from "@/lib/prisma";

/** Mis clubes (membresías activas) y las invitaciones pendientes. */
export const GET = route(async () => {
  const user = await requireUser();
  const memberships = await prisma.orgMember.findMany({
    where: { userId: user.id },
    include: { org: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { memberships };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { name } = await parseBody(req, z.object({ name: z.string().trim().min(2, "Pon un nombre al club").max(80) }));
  return NextResponse.json(await createOrg(user, name), { status: 201 });
});
