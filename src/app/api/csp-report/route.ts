import { NextResponse } from "next/server";

import { recordServerError } from "@/lib/admin/server-errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const MAX_BYTES = 8 * 1024;

/**
 * v1.8 · Informes de violación de la CSP (los manda el navegador solo). Pública por fuerza: sin sesión,
 * limitada por IP, cuerpo máximo de 8 KB y solo se guarda la directiva y el origen bloqueado.
 */
export async function POST(req: Request) {
  if (!rateLimit(`csp:${clientIp(req.headers)}`, 30, 60 * 60_000).ok) return new NextResponse(null, { status: 204 });
  const text = (await req.text().catch(() => "")).slice(0, MAX_BYTES);
  try {
    const body = JSON.parse(text) as { "csp-report"?: Record<string, string> } | Array<{ body?: Record<string, string> }>;
    const r = Array.isArray(body) ? body[0]?.body : body["csp-report"];
    if (r) {
      const directive = String(r["violated-directive"] ?? r.effectiveDirective ?? r["effective-directive"] ?? "?");
      let blocked = String(r["blocked-uri"] ?? r.blockedURL ?? "?");
      try {
        blocked = new URL(blocked).origin;
      } catch {
        // «inline», «eval»…
      }
      const page = (() => {
        try {
          return new URL(String(r["document-uri"] ?? r.documentURL ?? "")).pathname;
        } catch {
          return "?";
        }
      })();
      await recordServerError("CSP", page, `${directive} bloqueó ${blocked}`);
    }
  } catch {
    // informe mal formado: se ignora
  }
  return new NextResponse(null, { status: 204 });
}
