import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LifeOS",
    short_name: "LifeOS",
    description: "Rendimiento atlético, recuperación, finanzas, nutrición y estudio con IA.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "es",
    // Iconos 192/512 se añadirán en Fase 3 (public/icons/).
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
