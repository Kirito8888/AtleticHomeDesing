import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { isEmptyAccount, restoreExport } from "@/lib/account/restore";
import { requireUser } from "@/lib/auth/session";

const MAX_BYTES = 50 * 1024 * 1024;

/** GET: ¿la cuenta está vacía? · POST: restaura un JSON de «Descargar mis datos» (solo en cuenta vacía). */
export const GET = route(async () => {
  const user = await requireUser();
  return { empty: await isEmptyAccount(user.id) };
});

export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("import", user.id);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el fichero");
  if (file.size > MAX_BYTES) throw new ApiError(413, "El fichero supera 50 MB");
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new ApiError(400, "El fichero no es un JSON válido");
  }
  return restoreExport(user.id, data);
});
