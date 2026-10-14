import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { inviteMember } from "@/lib/clubs/service";

/** La administradora del club invita por email; la persona decide al aceptar qué ve el staff. */
export const POST = route(async (req, ctx: RouteContext<"/api/clubs/[id]/members">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { email, role } = await parseBody(
    req,
    z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(["ADMIN", "COACH", "ATHLETE"]).default("ATHLETE") }),
  );
  const m = await inviteMember(user, id, email, role);
  return NextResponse.json({ id: m.id }, { status: 201 });
});
