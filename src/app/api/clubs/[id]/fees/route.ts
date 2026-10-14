import { NextResponse } from "next/server";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { feeCreateSchema } from "@/lib/clubs/fees";
import { listFees, recordFee } from "@/lib/clubs/service";

export const GET = route(async (_req, ctx: RouteContext<"/api/clubs/[id]/fees">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return { fees: await listFees(user, id) };
});

/** Apunte contable manual (solo la administradora del club). No cobra nada. */
export const POST = route(async (req, ctx: RouteContext<"/api/clubs/[id]/fees">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const fee = await recordFee(user, id, await parseBody(req, feeCreateSchema));
  return NextResponse.json({ id: fee.id }, { status: 201 });
});
