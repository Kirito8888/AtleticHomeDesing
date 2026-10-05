// =============================================================================
// Troceado de apuntes para RAG. Fragmentos de ~1200 caracteres (≈ 300 tokens)
// con 200 de solape, cortando preferentemente en párrafo > frase > palabra
// para no partir ideas por la mitad.
// =============================================================================

export interface Chunk {
  content: string;
  page: number | null;
  index: number;
}

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Mejor punto de corte ≤ max: doble salto, fin de frase, espacio; si no, corte duro. */
function cutPoint(text: string, max: number): number {
  if (text.length <= max) return text.length;
  const window = text.slice(0, max);
  const min = Math.floor(max * 0.5);
  for (const re of [/\n\n(?![\s\S]*\n\n)/, /[.!?…]\s(?![\s\S]*[.!?…]\s)/, /\s(?![\s\S]*\s)/]) {
    const m = re.exec(window);
    if (m && m.index + m[0].length >= min) return m.index + m[0].length;
  }
  return max;
}

export function chunkText(text: string, page: number | null = null, opts: ChunkOptions = {}): Omit<Chunk, "index">[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = Math.min(opts.overlap ?? 200, Math.floor(maxChars / 2));
  const clean = normalize(text);
  const out: Omit<Chunk, "index">[] = [];
  let pos = 0;
  while (pos < clean.length) {
    const end = pos + cutPoint(clean.slice(pos), maxChars);
    const content = clean.slice(pos, end).trim();
    if (content) out.push({ content, page });
    if (end >= clean.length) break;
    // Retrocede `overlap` pero alineado a inicio de palabra.
    let next = Math.max(end - overlap, pos + 1);
    const space = clean.indexOf(" ", next);
    if (space !== -1 && space < end) next = space + 1;
    pos = next;
  }
  return out;
}

/** Trocea un documento por páginas (PDF) o como bloque único (texto/markdown). */
export function chunkDocument(pages: string[], opts?: ChunkOptions): Chunk[] {
  const isPaged = pages.length > 1;
  return pages
    .flatMap((p, i) => chunkText(p, isPaged ? i + 1 : null, opts))
    .map((c, index) => ({ ...c, index }));
}
