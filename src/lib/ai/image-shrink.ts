import "server-only";

import { ApiError } from "@/lib/api";

/**
 * L4 · Reduce en el servidor las imágenes grandes antes de enviarlas a la IA local.
 * Salida siempre JPEG (llama.cpp no decodifica WebP). Solo se carga sharp si hace falta.
 */

/** Objetivo de tamaño tras reducir (holgadamente por debajo del tope de 5 MB). */
export const TARGET_IMAGE_BYTES = 2 * 1024 * 1024;
/** Escalones de reducción: lado máximo (px) y calidad JPEG. */
const STEPS = [
  { side: 2048, quality: 80 },
  { side: 1600, quality: 70 },
  { side: 1280, quality: 60 },
] as const;
const MAX_INPUT_PIXELS = 100_000_000;

export const IMAGE_INVALID_CODE = "ai_local_image_invalid";

/**
 * @param buf imagen original (JPEG/PNG/…)
 * @returns JPEG de lado ≤ 2048 px, ~≤ 2 MB (si ni el último escalón cabe, devuelve ese)
 * @throws ApiError 422 `ai_local_image_invalid` si no es una imagen procesable (corrupta, demasiados píxeles…)
 */
export async function shrinkImage(buf: Buffer): Promise<{ buffer: Buffer; mime: "image/jpeg" }> {
  try {
    const { default: sharp } = await import("sharp");
    sharp.cache(false);
    let out: Buffer = buf;
    for (const s of STEPS) {
      out = await sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
        .rotate()
        .resize({ width: s.side, height: s.side, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: s.quality, mozjpeg: true })
        .toBuffer();
      if (out.length <= TARGET_IMAGE_BYTES) break;
    }
    return { buffer: out, mime: "image/jpeg" };
  } catch {
    throw new ApiError(422, "La imagen no se puede procesar", { code: IMAGE_INVALID_CODE });
  }
}
