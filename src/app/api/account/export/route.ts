import { exportAccount } from "@/lib/account/service";
import { enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { toIsoDay, today } from "@/lib/dates";

/** Descarga de todos los datos del usuario en JSON. */
export const GET = route(async () => {
  const user = await requireUser();
  enforceRateLimit("export", user.id);
  const data = await exportAccount(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="lifeos-export-${toIsoDay(today())}.json"`,
      "cache-control": "no-store",
    },
  });
});
