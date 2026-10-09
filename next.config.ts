import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin cabecera «X-Powered-By: Next.js» (no anunciar la tecnología).
  poweredByHeader: false,
  // Bundle autocontenido para la imagen Docker (ver Dockerfile).
  output: "standalone",
  // v1.7: la escritura de apuntes en UPLOAD_DIR (ruta dinámica) hacía que el trazado metiera TODO el
  // proyecto en la imagen (código fuente, docs, tests, ~13 MB). En ejecución solo hacen falta .next y
  // node_modules; public/ lo copia el Dockerfile aparte.
  outputFileTracingExcludes: {
    "/*": [
      "src/**/*",
      "docs/**/*",
      "e2e/**/*",
      "deploy/**/*",
      "scripts/**/*",
      "prisma/**/*",
      "public/**/*",
      "*.md",
      "Dockerfile",
      "docker-compose.yml",
      "package-lock.json",
      "tsconfig*.json",
      "*.config.{ts,mjs}",
      "components.json",
    ],
  },
  // Cabeceras recomendadas por la guía PWA de Next.js.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Cámara solo para el propio origen (escáner de códigos de barras).
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          // HTTPS obligatorio durante 1 año (solo lo respetan los navegadores si llega por HTTPS).
          // Sin includeSubDomains: el dominio DuckDNS no es nuestro.
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          // v1.7: nada de este sitio se incrusta desde otro origen ni hereda su proceso.
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Origin-Agent-Cluster", value: "?1" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
