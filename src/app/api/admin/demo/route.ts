import { NextResponse } from "next/server";
import { z } from "zod";

import { parseBody, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/admin";
import { AUDIENCES, type Audience } from "@/lib/demo/audiences";
import { createDemoAccount, listDemoAccounts } from "@/lib/demo/service";

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
