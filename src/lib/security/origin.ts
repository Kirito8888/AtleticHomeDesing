/**
 * Defensa en profundidad contra CSRF en las mutaciones de /api: si el navegador manda `Origin`, tiene que ser el de la
 * instalación (`AUTH_URL`; sin ella, el de la propia petición). Sin `Origin` (curl, scripts, servidor a servidor) se acepta
 * salvo que el navegador diga `Sec-Fetch-Site: cross-site`. No cubre /api/auth/* (Auth.js tiene su token), el informe CSP
 * ni las rutas públicas con token (no pasan por `route()`).
 */
export function originAllowed(headers: Headers, expected: string): boolean {
  const origin = headers.get("origin");
  if (origin) return origin === expected;
  return headers.get("sec-fetch-site") !== "cross-site";
}

export function expectedOrigin(authUrl: string | undefined, requestUrl: string): string {
  try {
    return new URL(authUrl || requestUrl).origin;
  } catch {
    return new URL(requestUrl).origin;
  }
}
