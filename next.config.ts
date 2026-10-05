import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle autocontenido para la imagen Docker (ver Dockerfile).
  output: "standalone",
};

export default nextConfig;
