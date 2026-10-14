import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { ocrAny } from "@/lib/files/ocr";
import { parseNutritionLabel } from "@/lib/files/ocr-parse";

const MAX = 8 * 1024 * 1024;

/** v1.10 · Lee la tabla nutricional de una etiqueta (foto) y propone los valores por 100 g. No guarda nada. */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("ocr", user.id);
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta la foto");
  if (file.size > MAX) throw new ApiError(413, "La foto supera 8 MB");
  const values = parseNutritionLabel(await ocrAny(Buffer.from(await file.arrayBuffer())));
  return { values, found: Object.keys(values).length };
});
