import { NextResponse } from "next/server";

import { ApiError, route } from "@/lib/api";
import { env } from "@/lib/env";
import { requireUser } from "@/lib/auth/session";
import { auditContext } from "@/lib/security/audit";
import { checkState, connectStrava, syncStrava } from "@/lib/strava/service";

/** v1.10 · Vuelta de Strava: comprueba el `state` firmado, guarda la conexión e importa lo reciente. */
export const GET = route(async (req) => {
  const user = await requireUser();
  const p = req.nextUrl.searchParams;
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?strava=${q}#strava`, env().AUTH_URL ?? req.url));
  if (p.get("error")) return back("denied");
  const state = p.get("state") ?? "";
  if (!checkState(state, user.id)) throw new ApiError(400, "Enlace de Strava caducado o no válido: vuelve a intentarlo desde Ajustes");
  try {
    await connectStrava(user.id, p.get("code") ?? "", p.get("scope"), fetch, auditContext(req.headers));
  } catch (e) {
    if (e instanceof ApiError && e.status < 500) return back(e.status === 409 ? "taken" : "scope");
    throw e;
  }
  await syncStrava(user.id, { budget: 15 }).catch(() => undefined); // lo demás, en la siguiente pasada
  return back("ok");
});
