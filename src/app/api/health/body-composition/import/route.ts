import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { importBodyComposition } from "@/lib/health/isak-service";

const MAX_BYTES = 2 * 1024 * 1024;

/** CSV o JSON de mediciones ISAK: vista previa, o guarda con ?commit=1. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("import", user.id);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el fichero");
  if (file.size > MAX_BYTES) throw new ApiError(413, "El fichero supera 2 MB");
  const kind = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
  const commit = req.nextUrl.searchParams.get("commit") === "1";
  return importBodyComposition(user.id, await file.text(), kind, commit);
});
