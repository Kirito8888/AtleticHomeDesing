import { getDocumentProxy } from "unpdf";

import type { PdfItem, PdfLine } from "./types";

/** Márgenes donde viven la cabecera y el pie que se repiten en cada página. */
const HEADER_BAND = 45;
const FOOTER_BAND = 45;
/** Dos trozos a menos de esta distancia vertical están en la misma línea. */
const SAME_LINE = 2.5;

type RawItem = { str?: string; transform?: number[]; height?: number };

/**
 * Lee el texto de un PDF conservando la posición de cada trozo: así las
 * columnas de las tablas se separan por su x real, no por espacios.
 */
export async function pdfLines(bytes: Uint8Array, maxPages = 120): Promise<PdfLine[]> {
  const pdf = await getDocumentProxy(bytes);
  try {
    const out: PdfLine[] = [];
    const pages = Math.min(pdf.numPages, maxPages);
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const { height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PdfItem[] = [];
      for (const raw of content.items as RawItem[]) {
        if (!raw.str || !raw.str.trim() || !raw.transform) continue;
        const [a, b, , , x, y] = raw.transform;
        items.push({ x, y, str: raw.str, size: Math.hypot(a, b) || raw.height || 0 });
      }
      out.push(...groupLines(items, p, height));
      page.cleanup();
    }
    return out;
  } finally {
    await pdf.cleanup();
  }
}

/** Agrupa trozos en líneas (de arriba abajo) y marca cabecera y pie. Pura: se prueba sin PDF. */
export function groupLines(items: PdfItem[], page: number, pageHeight: number): PdfLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfLine[] = [];
  for (const it of sorted) {
    const cur = lines.at(-1);
    if (cur && Math.abs(cur.y - it.y) <= SAME_LINE) cur.items.push(it);
    else lines.push({ page, y: it.y, size: 0, items: [it], role: "body" });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    // Tamaño del trozo con más texto: una viñeta grande no cambia la línea.
    l.size = l.items.reduce((best, i) => (i.str.trim().length > best.str.trim().length ? i : best)).size;
    l.role = l.y > pageHeight - HEADER_BAND ? "header" : l.y < FOOTER_BAND ? "footer" : "body";
  }
  return lines;
}

export const lineText = (l: PdfLine) =>
  l.items
    .map((i) => i.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
