/**
 * v2.1 · Clips de demostración propios (MP4 / WebM). Puro, sin acceso a disco: lo usan el servicio y los tests.
 * El tipo se decide por la firma del fichero, no por lo que diga el navegador.
 */
export const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
export const VIDEO_MIMES = ["video/mp4", "video/webm"] as const;
export type VideoMime = (typeof VIDEO_MIMES)[number];

const MP4_BRANDS = new Set(["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V "]);

/** `ftyp` con marca MP4 → mp4; EBML con DocType «webm» → webm; QuickTime (`qt  `), MKV y el resto → null. */
export function sniffVideo(buf: Buffer): VideoMime | null {
  if (buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") {
    return MP4_BRANDS.has(buf.subarray(8, 12).toString("latin1")) ? "video/mp4" : null;
  }
  if (buf.length > 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    // El DocType va en la cabecera EBML (primeros bytes): «webm» frente a «matroska».
    return buf.subarray(0, Math.min(buf.length, 64)).toString("latin1").includes("webm") ? "video/webm" : null;
  }
  return null;
}

export type VideoCheck = { ok: true; mime: VideoMime } | { ok: false; status: 413 | 415; message: string };

export function checkVideo(buf: Buffer): VideoCheck {
  if (buf.length === 0) return { ok: false, status: 415, message: "El vídeo está vacío" };
  if (buf.length > VIDEO_MAX_BYTES) return { ok: false, status: 413, message: "El vídeo ocupa demasiado (máx. 25 MB por clip)" };
  const mime = sniffVideo(buf);
  if (!mime) {
    const qt = buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp" && buf.subarray(8, 12).toString("latin1") === "qt  ";
    return { ok: false, status: 415, message: qt ? "Es un vídeo QuickTime (.mov): expórtalo como MP4" : "Solo vídeos MP4 o WebM" };
  }
  return { ok: true, mime };
}
