import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { authorizeUrl } from "@/lib/strava/service";

/** v1.10 · Empieza la conexión con Strava (OAuth): redirige a su página de permiso. */
export const GET = route(async () => {
  const user = await requireUser();
  return NextResponse.redirect(authorizeUrl(user.id));
});
