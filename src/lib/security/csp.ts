// Content-Security-Policy con nonce por petición (guía de Next 16:
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * - script-src: solo scripts con el nonce (y los que estos carguen: 'strict-dynamic').
 * - style-src 'unsafe-inline' (DEUDA CONOCIDA, V3-S10): Recharts, sonner y las barras de
 *   progreso usan atributos style; un nonce no cubre atributos. El riesgo de CSS inyectado
 *   es muy inferior al de scripts, que sí quedan bloqueados. Salida: separar
 *   `style-src-elem` (con nonce) de `style-src-attr` y retirar los atributos inline o
 *   sustituirlos por clases cuando las librerías lo permitan. Ver docs/arquitectura.md.
 * - report-uri + report-to: el primero lo entienden todos los navegadores; el segundo usa la
 *   cabecera Reporting-Endpoints (REPORTING_ENDPOINTS) y apunta a la misma ruta.
 * - connect-src 'self': el navegador solo habla con Atlenza; Gemini y Open Food
 *   Facts se llaman desde el servidor.
 */
/** Valor de la cabecera `Reporting-Endpoints`: mismo destino que `report-uri` (ruta relativa). */
export const REPORTING_ENDPOINTS = 'csp-endpoint="/api/csp-report"';

export function buildCsp(nonce: string, opts: { dev: boolean; https: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // v1.8 · Las violaciones se registran (agregadas) en Estado del servidor
    "report-uri /api/csp-report",
    "report-to csp-endpoint",
    ...(opts.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
