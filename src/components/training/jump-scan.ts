import { frameToTime } from "@/lib/training/jump";
import { type MotionSignal, motionFromFrames } from "@/lib/training/jump-detect";

/** Tope de fotogramas a analizar (≈ 10 s a 240 fps); más allá se pide recortar el vídeo. */
export const MAX_SCAN_FRAMES = 2400;
const SCAN_WIDTH = 96;
const SEEK_TIMEOUT_MS = 2000;

/**
 * Lee el vídeo en el navegador (vídeo oculto propio, canvas pequeño; nada se sube ni se exporta) y devuelve, por fotograma,
 * la fracción de píxeles que cambian en el tercio inferior (la zona de los pies). Un fotograma ilegible queda como null.
 */
export async function scanMotion(
  src: string,
  fileFps: number,
  totalFrames: number,
  { onProgress, signal }: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<MotionSignal | null> {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = src;
  try {
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error("video"));
      setTimeout(() => rej(new Error("timeout")), 8000);
    });
    const w = SCAN_WIDTH;
    const zoneTop = Math.floor(v.videoHeight * (2 / 3));
    const zoneH = v.videoHeight - zoneTop;
    const h = Math.max(1, Math.round((w * zoneH) / Math.max(1, v.videoWidth)));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const total = Math.min(totalFrames, MAX_SCAN_FRAMES);
    const out: MotionSignal = [];
    let prev: Uint8ClampedArray | null = null;
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) return null;
      const ok = await seekTo(v, frameToTime(i, fileFps));
      let gray: Uint8ClampedArray | null = null;
      if (ok) {
        ctx.drawImage(v, 0, zoneTop, v.videoWidth, zoneH, 0, 0, w, h);
        const px = ctx.getImageData(0, 0, w, h).data;
        gray = new Uint8ClampedArray(w * h);
        for (let k = 0; k < gray.length; k++) gray[k] = (px[4 * k] * 77 + px[4 * k + 1] * 150 + px[4 * k + 2] * 29) >> 8;
      }
      out.push(gray ? motionFromFrames(prev, gray) : null);
      prev = gray;
      if (i % 8 === 0) onProgress?.(i + 1, total);
    }
    onProgress?.(total, total);
    return out;
  } catch {
    return null;
  } finally {
    v.removeAttribute("src");
    v.load();
  }
}

function seekTo(v: HTMLVideoElement, t: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (Math.abs(v.currentTime - t) < 1e-6) return resolve(true);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      v.removeEventListener("seeked", onSeeked);
      resolve(ok);
    };
    const onSeeked = () => done(true);
    const timer = setTimeout(() => done(false), SEEK_TIMEOUT_MS);
    v.addEventListener("seeked", onSeeked);
    v.currentTime = t;
  });
}
