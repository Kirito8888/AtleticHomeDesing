import { NextResponse } from "next/server";

import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { parsePlanUpload, PLAN_LIMITS, PlanImportError } from "@/lib/planning/plan-import/files";
import { commitPlanImport, previewPlanImport } from "@/lib/planning/plan-import/service";

/**
 * multipart/form-data: files (el zip del plan o los PDF «día a día» sueltos).
 * Sin ?commit=1 devuelve la vista previa; con ?commit=1 importa.
 * Los PDF no se guardan: se leen en memoria y solo se conserva el plan estructurado.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("planImport", user.id);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > PLAN_LIMITS.uploadBytes + 64 * 1024) throw new ApiError(413, "El plan supera 30 MB");
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Se esperaba multipart/form-data");
  });
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw new ApiError(400, "Sube el zip del plan o sus PDF");
  if (files.length > PLAN_LIMITS.zipEntries) throw new ApiError(400, `Como mucho ${PLAN_LIMITS.zipEntries} ficheros`);
  if (files.reduce((a, f) => a + f.size, 0) > PLAN_LIMITS.uploadBytes) throw new ApiError(413, "El plan supera 30 MB");

  let upload;
  try {
    upload = await parsePlanUpload(await Promise.all(files.map(async (f) => ({ name: f.name.slice(0, 200), bytes: new Uint8Array(await f.arrayBuffer()) }))));
  } catch (e) {
    if (e instanceof PlanImportError) throw new ApiError(400, e.message);
    throw e;
  }
  if (req.nextUrl.searchParams.get("commit") === "1") {
    return NextResponse.json(await commitPlanImport(user.id, upload), { status: 201 });
  }
  return previewPlanImport(user.id, upload);
});
