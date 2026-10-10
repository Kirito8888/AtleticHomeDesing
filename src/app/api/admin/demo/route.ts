import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { AUDIENCES, type Audience } from "@/lib/demo/audiences";
import { createDemoAccount, listDemoAccounts } from "@/lib/demo/service";

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ApiError(403, "Solo para administración");
  return user;
}

/** v1.7 · Cuentas demo con datos sintéticos (solo administración). */
export const GET = route(async () => {
  await requireAdmin();
  return listDemoAccounts();
});

export const POST = route(async (req) => {
  await requireAdmin();
  const { audience } = await parseBody(req, z.object({ audience: z.enum(Object.keys(AUDIENCES) as [Audience, ...Audience[]]) }));
  return NextResponse.json(await createDemoAccount(audience), { status: 201, headers: { "Cache-Control": "no-store" } });
});
