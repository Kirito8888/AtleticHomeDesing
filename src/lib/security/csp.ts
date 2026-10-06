// Content-Security-Policy con nonce por petición (guía de Next 16:
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).

export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/**
 * - script-src: solo scripts con el nonce (y los que estos carguen: 'strict-dynamic').
 * - style-src 'unsafe-inline': Recharts, sonner y las barras de progreso usan
 *   atributos style; un nonce no cubre atributos. El riesgo de CSS inyectado es
 *   muy inferior al de scripts, que sí quedan bloqueados.
 * - connect-src 'self': el navegador solo habla con LifeOS; Gemini y Open Food
 *   Facts se llaman desde el servidor.
 */
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
    ...(opts.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
