import { NextResponse } from "next/server";

import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { bankMappingSchema } from "@/lib/finance/bank-import";
import { decodeStatement, importStatement, previewStatement } from "@/lib/finance/bank-import-service";

/**
 * multipart/form-data: file (CSV o Norma 43), accountId, mapping (JSON, solo CSV).
 * Sin ?commit=1 devuelve la vista previa (nuevos, duplicados, errores).
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("import", user.id);
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Se esperaba multipart/form-data");
  });
  const file = form.get("file");
  const accountId = form.get("accountId");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el extracto");
  if (typeof accountId !== "string" || !accountId) throw new ApiError(400, "Elige la cuenta");
  const text = decodeStatement(Buffer.from(await file.arrayBuffer()));
  const rawMapping = form.get("mapping");
  let mapping = null;
  if (typeof rawMapping === "string" && rawMapping) {
    let json: unknown;
    try {
      json = JSON.parse(rawMapping);
    } catch {
      throw new ApiError(400, "Mapeo de columnas no válido");
    }
    const parsed = bankMappingSchema.safeParse(json);
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Mapeo de columnas no válido");
    mapping = parsed.data;
  }
  if (req.nextUrl.searchParams.get("commit") === "1") {
    return NextResponse.json(await importStatement(user.id, accountId, text, mapping), { status: 201 });
  }
  return previewStatement(user.id, accountId, text, mapping);
});
