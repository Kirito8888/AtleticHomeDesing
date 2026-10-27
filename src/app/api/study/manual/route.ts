import { generateManualPdf } from "@/lib/ai/study-manual";
import { enforceRateLimit, parseBody, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { manualRequestSchema } from "@/lib/study/practical-manual";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * `POST /api/study/manual` · Genera el manual práctico en PDF a partir de los apuntes de la usuaria.
 *
 * - Entrada: JSON `manualRequestSchema` (origen de los apuntes: asignatura, apunte o tema).
 * - Salida: `200 application/pdf` (descarga `manual-practico-<slug>.pdf`, `no-store`). No se guarda nada en BD.
 * - Errores: 400 cuerpo no válido · 401 sin sesión · 403 origen no permitido, condiciones sin aceptar, IA sin consentimiento o tratamiento limitado ·
 *   404/409/422 apuntes inexistentes o sin procesar · 429 límite `aiGenerate` (10/h) · 503 IA sin configurar o sin Chromium en el servidor.
 * - Aislamiento: los apuntes se leen siempre con el `userId` de la sesión; nunca hay acceso por entrenadora.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  await enforceRateLimit("aiGenerate", user.id);
  const { pdf, title } = await generateManualPdf(user.id, await parseBody(req, manualRequestSchema));
  const slug = title.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 40) || "manual";
  return new Response(pdf.buffer as ArrayBuffer, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="manual-practico-${slug}.pdf"`, "Cache-Control": "no-store" },
  });
});
