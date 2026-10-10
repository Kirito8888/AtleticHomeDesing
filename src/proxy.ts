import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { buildCsp, generateNonce } from "@/lib/security/csp";

/** Páginas de acceso: con sesión iniciada no tiene sentido verlas. */
const AUTH_PATHS = ["/login", "/register", "/reset"];
/** Accesibles sin sesión. */
const PUBLIC_PATHS = [...AUTH_PATHS, "/offline", "/legal"];

const matches = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const cspOpts = {
  dev: process.env.NODE_ENV === "development",
  https: process.env.AUTH_URL?.startsWith("https://") ?? false,
};

/**
 * Proxy (antes "middleware" en Next ≤ 15): protege todas las páginas y añade
 * la CSP con nonce. Las rutas /api se protegen en cada handler (devuelven 401
 * en JSON en vez de redirigir).
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (!req.auth && !matches(pathname, PUBLIC_PATHS)) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + search);
    return Response.redirect(url);
  }
  if (req.auth && matches(pathname, AUTH_PATHS)) return Response.redirect(new URL("/", req.nextUrl));

  // Next lee el nonce de la cabecera CSP de la petición y lo aplica a sus scripts.
  const nonce = generateNonce();
  const csp = buildCsp(nonce, cspOpts);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)"],
};
