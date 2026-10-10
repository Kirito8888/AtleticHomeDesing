import { NextResponse } from "next/server";

import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { today, toIsoDay } from "@/lib/dates";
import { addInjuryPhoto, PHOTO_MAX_BYTES } from "@/lib/recovery/wellbeing-service";

type Ctx = RouteContext<"/api/recovery/injuries/[id]/photos">;

/**
 * v1.7 · Foto de una molestia (multipart: file, takenOn?). El navegador la reescala y la vuelve a
 * codificar antes de subirla (eso quita el EXIF y la ubicación); aquí se comprueba la firma y se cifra.
 */
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireUser();
  enforceRateLimit("photoUpload", user.id);
  const { id } = await ctx.params;
  if (Number(req.headers.get("content-length") ?? 0) > PHOTO_MAX_BYTES + 64 * 1024) throw new ApiError(413, "La foto ocupa demasiado (máx. 4 MB)");
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Se esperaba multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el campo 'file'");
  if (file.size > PHOTO_MAX_BYTES) throw new ApiError(413, "La foto ocupa demasiado (máx. 4 MB)");
  const takenOn = String(form.get("takenOn") ?? "");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(takenOn) ? takenOn : toIsoDay(today());
  return NextResponse.json(await addInjuryPhoto(user.id, id, Buffer.from(await file.arrayBuffer()), day), { status: 201 });
});
