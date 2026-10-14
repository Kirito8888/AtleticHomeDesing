import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { ApiError } from "@/lib/api";
import { sniffFile } from "@/lib/files/sealed-files";

/**
 * v1.10 · OCR en el propio servidor con Tesseract (Apache-2.0) y pdftoppm (poppler). Nada sale del
 * servidor. Sin shell (execFile), con tiempo límite, máximo de páginas y ficheros temporales que se
 * borran siempre. Si Tesseract no está instalado (desarrollo), se dice y lo demás sigue funcionando.
 */
const run = promisify(execFile);
const MAX_PAGES = 20;
const OPTS = { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 };

let available: Promise<boolean> | null = null;
export function ocrAvailable(): Promise<boolean> {
  available ??= run("tesseract", ["--version"], { timeout: 5000 }).then(
    () => true,
    () => false,
  );
  return available;
}

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "atlenza-ocr-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function tesseract(file: string): Promise<string> {
  const { stdout } = await run("tesseract", [file, "stdout", "-l", "spa+eng", "--psm", "3"], OPTS);
  return stdout;
}

async function assertAvailable() {
  if (!(await ocrAvailable())) throw new ApiError(503, "La lectura de texto (OCR) no está disponible en este servidor: instala tesseract-ocr", { code: "ocr_unavailable" });
}

/** Texto de una imagen (JPEG, PNG o WebP). */
export async function ocrImage(buf: Buffer): Promise<string> {
  await assertAvailable();
  const mime = sniffFile(buf);
  if (!mime?.startsWith("image/")) throw new ApiError(415, "Se esperaba una imagen (JPEG, PNG o WebP)");
  return withTmp(async (dir) => {
    const file = path.join(dir, `in.${mime.split("/")[1]}`);
    await writeFile(file, buf);
    return tesseract(file);
  });
}

/** Texto de un PDF escaneado, página a página (máximo 20). */
export async function ocrPdf(buf: Buffer, maxPages = MAX_PAGES): Promise<string[]> {
  await assertAvailable();
  if (sniffFile(buf) !== "application/pdf") throw new ApiError(415, "Se esperaba un PDF");
  return withTmp(async (dir) => {
    const pdf = path.join(dir, "in.pdf");
    await writeFile(pdf, buf);
    const pages: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      // Una página cada vez (200 ppp en gris): poco disco temporal aunque el PDF sea largo
      try {
        await run("pdftoppm", ["-f", String(i), "-l", String(i), "-r", "200", "-gray", "-png", pdf, path.join(dir, "p")], OPTS);
      } catch {
        break; // no hay más páginas o el PDF no se puede leer
      }
      const img = (await readdir(dir)).find((f) => f.startsWith("p") && f.endsWith(".png"));
      if (!img) break;
      pages.push(await tesseract(path.join(dir, img)));
      await rm(path.join(dir, img), { force: true });
    }
    return pages;
  });
}

/** Imagen o PDF: el texto entero (las páginas separadas por saltos). */
export async function ocrAny(buf: Buffer): Promise<string> {
  return sniffFile(buf) === "application/pdf" ? (await ocrPdf(buf, 3)).join("\n\n") : ocrImage(buf);
}
