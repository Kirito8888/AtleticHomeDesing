import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { sniffFile } from "@/lib/files/sealed-files";
import { photoToDraft } from "@/lib/nutrition/food-ai";

const MAX = 4 * 1024 * 1024;

/** v1.10 · Foto de la comida → borrador de alimentos y gramos (con la IA del usuario). La foto no se guarda. */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("aiGenerate", user.id);
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta la foto");
  if (file.size > MAX) throw new ApiError(413, "La foto supera 4 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffFile(buf);
  if (mime !== "image/jpeg" && mime !== "image/png") throw new ApiError(415, "Se esperaba una foto JPEG o PNG");
  return photoToDraft(user.id, { mime, base64: buf.toString("base64") });
});
