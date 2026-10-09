import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle autocontenido para la imagen Docker (ver Dockerfile).
  output: "standalone",
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
