import { NextResponse } from "next/server";

import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { sweatTestSchema } from "@/lib/nutrition/v17-nutrition";
import { addSweatTest, listSweatTests } from "@/lib/nutrition/v17-service";

/** v1.7 · Pruebas de tasa de sudoración. */
export const GET = route(async () => {
  const user = await requireUser();
  return listSweatTests(user.id);
});

export const POST = route(async (req) => {
  const user = await requireUser();
  return NextResponse.json(await addSweatTest(user.id, await parseBody(req, sweatTestSchema)), { status: 201 });
});
