import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createManagedAthlete } from "@/lib/managed/service";
import { portfolio } from "@/lib/managed/portfolio";

/** Cartera de la entrenadora: fichas (sin cuenta) + atletas con cuenta. Solo COACH/ADMIN. */
export const GET = route(async () => {
  const user = await requireUser();
  return { athletes: await portfolio(user) };
});

/** Alta de una ficha (alias, año o categoría, conformidad). Nunca nombre real, email ni teléfono. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const f = await createManagedAthlete(user, await req.json().catch(() => null));
  return NextResponse.json({ id: f.userId }, { status: 201 });
});
