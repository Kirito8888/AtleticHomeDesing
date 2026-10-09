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
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Registrar sesión", short_name: "Sesión", url: "/training/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Agua", short_name: "Agua", url: "/nutrition#agua", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Pomodoro", short_name: "Pomodoro", url: "/study/focus", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Hábitos de hoy", short_name: "Hábitos", url: "/#habitos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
