import { NextResponse } from "next/server";

import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { addReceipt, RECEIPT_MAX_BYTES } from "@/lib/finance/season-service";

/** v1.7 · Justificante de un movimiento (multipart: file). Se comprueba la firma real y se guarda cifrado. */
export const POST = route(async (req, ctx: RouteContext<"/api/finance/transactions/[id]/receipts">) => {
  const user = await requireUser();
  enforceRateLimit("photoUpload", user.id);
  const { id } = await ctx.params;
  if (Number(req.headers.get("content-length") ?? 0) > RECEIPT_MAX_BYTES + 64 * 1024) throw new ApiError(413, "El justificante ocupa demasiado (máx. 5 MB)");
  const form = await req.formData().catch(() => {
    throw new ApiError(400, "Se esperaba multipart/form-data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el campo 'file'");
  if (file.size > RECEIPT_MAX_BYTES) throw new ApiError(413, "El justificante ocupa demasiado (máx. 5 MB)");
  return NextResponse.json(await addReceipt(user.id, id, Buffer.from(await file.arrayBuffer())), { status: 201 });
});
