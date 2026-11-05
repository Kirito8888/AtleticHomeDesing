// Extracción de texto de apuntes .docx con mammoth. El ZIP se revisa y se descomprime ANTES con fflate y topes
// (como pptx.ts): mammoth usa jszip sin límites, así que solo recibe un ZIP reducido a las partes de texto.
import { unzipSync, zipSync } from "fflate";
import mammoth from "mammoth";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_PAGES = 500;
const TEXT_PARTS = /^(\[Content_Types\]\.xml|_rels\/\.rels|word\/(document|styles|numbering|footnotes|endnotes)\.xml|word\/_rels\/document\.xml\.rels)$/;

export type DocxErrorCode = "encrypted" | "invalid" | "too_big" | "empty";
export class DocxError extends Error {
  constructor(readonly code: DocxErrorCode, message: string) {
    super(message);
  }
}

const isZip = (b: Buffer) => b.length > 30 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

/** Firma ZIP y presencia de la parte principal de Word (los nombres van sin comprimir en las cabeceras). */
export function looksLikeDocx(buf: Buffer): boolean {
  return isZip(buf) && buf.includes("word/document.xml");
}

/** Word guarda los .docx con contraseña como contenedor OLE/CFB, no como ZIP. */
export function isEncryptedOffice(buf: Buffer): boolean {
  return buf.length > 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 && buf[4] === 0xa1 && buf[5] === 0xb1;
}

/** Lista las partes sin descomprimir nada y aplica los topes. @throws {DocxError} */
export function inspectDocx(buf: Buffer): void {
  if (isEncryptedOffice(buf)) throw new DocxError("encrypted", "El documento está protegido con contraseña");
  if (!isZip(buf)) throw new DocxError("invalid", "No es un DOCX válido");
  let total = 0;
  let hasMain = false;
  try {
    unzipSync(new Uint8Array(buf), {
      filter: (f) => {
        if (f.originalSize > MAX_ENTRY_BYTES) throw new DocxError("too_big", "Una parte del documento es demasiado grande");
        total += f.originalSize;
        if (total > MAX_TOTAL_BYTES) throw new DocxError("too_big", "El documento es demasiado grande al descomprimirlo");
        if (f.name === "word/document.xml") hasMain = true;
        return false;
      },
    });
  } catch (err) {
    if (err instanceof DocxError) throw err;
    throw new DocxError("invalid", "El DOCX está dañado");
  }
  if (!hasMain) throw new DocxError("invalid", "No es un DOCX válido");
}

/** ZIP reducido a las partes de texto (sin imágenes ni incrustados), con topes de descompresión. */
function safeDocxBuffer(buf: Buffer): Buffer {
  let total = 0;
  try {
    const files = unzipSync(new Uint8Array(buf), {
      filter: (f) => {
        if (!TEXT_PARTS.test(f.name)) return false;
        if (f.originalSize > MAX_ENTRY_BYTES) throw new DocxError("too_big", "Una parte del documento es demasiado grande");
        total += f.originalSize;
        if (total > MAX_TOTAL_BYTES) throw new DocxError("too_big", "El documento es demasiado grande al descomprimirlo");
        return true;
      },
    });
    return Buffer.from(zipSync(files, { level: 0 }));
  } catch (err) {
    if (err instanceof DocxError) throw err;
    throw new DocxError("invalid", "El DOCX está dañado");
  }
}

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, d, h) => (d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : (ENT[m.toLowerCase()] ?? m)));
const inline = (h: string) => decode(h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+\n/g, "\n").replace(/[ \t]+/g, " ").trim();

/** HTML de mammoth → líneas de texto: `#` por encabezado, `- ` por elemento de lista, filas de tabla con « | ». */
export function htmlToLines(html: string): string[] {
  const lines: string[] = [];
  const re = /<(h[1-6]|p|li|tr)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(re)) {
    const tag = m[1].toLowerCase();
    let text: string;
    if (tag === "tr") text = [...m[2].matchAll(/<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/gi)].map((c) => inline(c[1]).replace(/\n+/g, " ")).filter(Boolean).join(" | ");
    else if (tag === "li") text = inline(m[2].replace(/<[uo]l[\s\S]*$/i, ""));
    else text = inline(m[2]);
    if (!text) continue;
    if (tag[0] === "h") lines.push(`${"#".repeat(Number(tag[1]))} ${text}`);
    else if (tag === "li") lines.push(`- ${text}`);
    else lines.push(text);
  }
  return lines;
}

/** Agrupa en una «página» por sección (encabezado h1/h2); sin encabezados, una sola. */
export function pagesFromLines(lines: string[]): string[] {
  const pages: string[][] = [[]];
  for (const l of lines) {
    if (/^#{1,2} /.test(l) && pages[pages.length - 1].length) pages.push([]);
    pages[pages.length - 1].push(l);
  }
  const out = pages.map((p) => p.join("\n")).filter(Boolean);
  if (out.length <= MAX_PAGES) return out;
  const head = out.slice(0, MAX_PAGES - 1);
  return [...head, out.slice(MAX_PAGES - 1).join("\n")];
}

/**
 * Páginas de texto de un .docx (una por sección). Imágenes ignoradas.
 *
 * @throws {DocxError} protegido con contraseña, dañado, no es DOCX, supera los topes o no tiene texto.
 */
export async function extractDocxPages(buf: Buffer): Promise<string[]> {
  inspectDocx(buf);
  const safe = safeDocxBuffer(buf);
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ buffer: safe }, { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) })).value;
  } catch {
    throw new DocxError("invalid", "El DOCX está dañado");
  }
  const pages = pagesFromLines(htmlToLines(html));
  if (!pages.length) throw new DocxError("empty", "El documento no tiene texto");
  return pages;
}
