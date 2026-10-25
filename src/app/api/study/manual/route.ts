import { generateManualPdf } from "@/lib/ai/study-manual";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { manualRequestSchema } from "@/lib/study/practical-manual";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Genera y entrega el manual práctico en PDF. No se guarda en la BD. */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  const { pdf, title } = await generateManualPdf(user.id, await parseBody(req, manualRequestSchema));
  const slug = title.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 40) || "manual";
  return new Response(pdf.buffer as ArrayBuffer, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="manual-practico-${slug}.pdf"`, "Cache-Control": "no-store" },
  });
});
