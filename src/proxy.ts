import { auth } from "@/auth";

const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Proxy (antes "middleware" en Next ≤ 15): protege todas las páginas.
 * Las rutas /api se protegen en cada handler (devuelven 401 en JSON en vez de redirigir).
 */
export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!req.auth && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + search);
    return Response.redirect(url);
  }
  if (req.auth && isPublic) return Response.redirect(new URL("/", req.nextUrl));
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)"],
};
