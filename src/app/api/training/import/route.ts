import { NextResponse } from "next/server";

import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { MAX_ACTIVITY_BYTES } from "@/lib/training/activity-import";
import { importActivity, previewActivity } from "@/lib/training/activity-import-service";

/**
 * multipart/form-data: file (.fit, .gpx o .tcx). ?save=1 crea la sesión (TSS y
 * PMC incluidos); sin él, solo devuelve el resumen para revisarlo antes.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("import", user.id);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Se esperaba multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el campo 'file'");
  if (file.size > MAX_ACTIVITY_BYTES) throw new ApiError(413, "El fichero supera 25 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  if (req.nextUrl.searchParams.get("save") === "1") {
    return NextResponse.json(await importActivity(user.id, buf), { status: 201 });
  }
  return previewActivity(user.id, buf);
});
