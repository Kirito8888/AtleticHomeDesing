import { parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { fvSeriesSchema } from "@/lib/training/fv-profile";
import { createFvSeries, listFvSeries } from "@/lib/training/fv-profile-service";

export const GET = route(async () => listFvSeries((await requireUser()).id));

/** Perfil F-V (Samozino): guarda las entradas; el servidor recalcula y rechaza lo que no da un perfil válido. */
export const POST = route(async (req) => {
  const user = await requireUser();
  return createFvSeries(user.id, await parseBody(req, fvSeriesSchema));
});
