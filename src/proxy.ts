import { auth } from "@/auth";

/** Páginas de acceso: con sesión iniciada no tiene sentido verlas. */
const AUTH_PATHS = ["/login", "/register"];
/** Accesibles sin sesión. */
const PUBLIC_PATHS = [...AUTH_PATHS, "/offline"];

const matches = (pathname: string, list: string[]) => list.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Proxy (antes "middleware" en Next ≤ 15): protege todas las páginas.
 * Las rutas /api se protegen en cada handler (devuelven 401 en JSON en vez de redirigir).
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  if (!req.auth && !matches(pathname, PUBLIC_PATHS)) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + search);
    return Response.redirect(url);
  }
  if (req.auth && matches(pathname, AUTH_PATHS)) return Response.redirect(new URL("/", req.nextUrl));
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)"],
};
