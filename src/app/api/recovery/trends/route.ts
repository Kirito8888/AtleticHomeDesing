import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { trendsFor } from "@/lib/recovery/trends-service";

/** Tendencias de meses (sueño, VFC, carga, molestias) de la usuaria en sesión, con avisos explicados. */
export const GET = route(async () => {
  const user = await requireUser();
  return trendsFor(user.id, toIsoDay(today()));
});
