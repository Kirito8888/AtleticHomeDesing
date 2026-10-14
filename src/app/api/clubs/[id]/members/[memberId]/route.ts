import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { removeMember, updateMember } from "@/lib/clubs/service";

const schema = z.object({
  status: z.literal("ACTIVE").optional(),
  canPlan: z.boolean().optional(),
  scopes: z.array(z.enum(["LOAD", "SESSIONS", "RECOVERY", "PLANNING", "REPORTS"])).max(5).optional(),
  role: z.enum(["ADMIN", "COACH", "ATHLETE"]).optional(),
});

export const PATCH = route(async (req, ctx: RouteContext<"/api/clubs/[id]/members/[memberId]">) => {
  const user = await requireUser();
  const { id, memberId } = await ctx.params;
  const m = await updateMember(user, id, memberId, await parseBody(req, schema));
  return { id: m.id, status: m.status, role: m.role };
});

export const DELETE = route(async (_req, ctx: RouteContext<"/api/clubs/[id]/members/[memberId]">) => {
  const user = await requireUser();
  const { id, memberId } = await ctx.params;
  await removeMember(user, id, memberId);
  return new NextResponse(null, { status: 204 });
});
