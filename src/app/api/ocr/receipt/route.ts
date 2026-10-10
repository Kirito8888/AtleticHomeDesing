import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { ocrAny } from "@/lib/files/ocr";
import { parseReceiptText } from "@/lib/files/ocr-parse";

const MAX = 8 * 1024 * 1024;

/** v1.10 · Lee un ticket o factura (foto o PDF) en el servidor y propone importe, fecha y comercio. No guarda nada. */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("ocr", user.id);
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el fichero");
  if (file.size > MAX) throw new ApiError(413, "El fichero supera 8 MB");
  const text = await ocrAny(Buffer.from(await file.arrayBuffer()));
  return { ...parseReceiptText(text), found: Boolean(text.trim()) };
});
