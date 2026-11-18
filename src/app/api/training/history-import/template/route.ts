import { route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { csvResponse } from "@/lib/csv";
import { buildTemplateCsv, buildTemplateXlsx } from "@/lib/training/history-import";

/** Plantilla del historial (datos de ejemplo sintéticos): ?format=xlsx (por defecto) o csv. */
export const GET = route(async (req) => {
  await requireUser();
  if (req.nextUrl.searchParams.get("format") === "csv") return csvResponse("plantilla-entrenamientos.csv", buildTemplateCsv());
  return new Response(Buffer.from(buildTemplateXlsx()), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="plantilla-entrenamientos.xlsx"',
      "cache-control": "no-store",
    },
  });
});
