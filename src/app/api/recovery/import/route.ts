import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { importHrvCsv } from "@/lib/recovery/hrv-import-service";
import { prefsSchema } from "@/lib/rules/prefs";

const MAX_BYTES = 2 * 1024 * 1024;
const mappingSchema = prefsSchema.shape.hrvCsvMapping.unwrap().unwrap();

/** CSV de VFC y sueño: vista previa, o importa con ?commit=1. */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("import", user.id);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el fichero");
  if (file.size > MAX_BYTES) throw new ApiError(413, "El fichero supera 2 MB");
  const mapping = mappingSchema.parse(JSON.parse(String(form.get("mapping") ?? "{}")));
  const commit = req.nextUrl.searchParams.get("commit") === "1";
  return importHrvCsv(user.id, await file.text(), mapping, commit);
});

