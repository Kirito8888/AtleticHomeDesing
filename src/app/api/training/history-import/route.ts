import { NextResponse } from "next/server";

import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { historyImportSchema, importHistory, previewHistory } from "@/lib/training/history-import-service";

/**
 * JSON { rows } (filas ya normalizadas en el navegador). Sin ?save=1 devuelve la vista previa (nueva, duplicada…);
 * con ?save=1 crea las sesiones nuevas y recalcula la carga una sola vez.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("import", user.id);
  const { rows } = await parseBody(req, historyImportSchema);
  if (req.nextUrl.searchParams.get("save") === "1") return NextResponse.json(await importHistory(user.id, rows), { status: 201 });
  return previewHistory(user.id, rows);
});
