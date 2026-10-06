/**
 * Generador mínimo de PDF para tests: texto Helvetica en posiciones exactas.
 * Sirve para imitar la maquetación de los PDF reales sin meter datos personales
 * en el repositorio. Solo caracteres WinAnsi (latin-1 + comillas y guiones).
 */
export type FixtureText = { x: number; y: number; size?: number; text: string };

const WIN_ANSI_EXTRA: Record<string, number> = { "€": 0x80, "–": 0x96, "—": 0x97, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95 };

function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = WIN_ANSI_EXTRA[ch] ?? ch.codePointAt(0)!;
    if (code > 0xff) throw new Error(`Carácter fuera de WinAnsi en el fixture: ${ch}`);
    if (code === 0x28 || code === 0x29 || code === 0x5c) out.push(0x5c);
    out.push(code);
  }
  return out;
}

export function buildPdf(pages: FixtureText[][], pageHeight = 842): Uint8Array {
  const chunks: number[] = [];
  const offsets: number[] = [];
  const push = (s: string | number[]) => {
    if (typeof s === "string") for (let i = 0; i < s.length; i++) chunks.push(s.charCodeAt(i) & 0xff);
    else chunks.push(...s);
  };
  const obj = (n: number, body: () => void) => {
    offsets[n] = chunks.length;
    push(`${n} 0 obj\n`);
    body();
    push("\nendobj\n");
  };

  push("%PDF-1.4\n");
  const firstPage = 4;
  const kids = pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(" ");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`));
  obj(3, () => push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  pages.forEach((texts, i) => {
    const pageObj = firstPage + i * 2;
    const content: number[] = [];
    for (const t of texts) {
      const head = `BT /F1 ${t.size ?? 8} Tf ${t.x} ${t.y} Td (`;
      for (let k = 0; k < head.length; k++) content.push(head.charCodeAt(k));
      content.push(...winAnsi(t.text));
      for (const ch of ") Tj ET\n") content.push(ch.charCodeAt(0));
    }
    obj(pageObj, () =>
      push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObj + 1} 0 R >>`),
    );
    obj(pageObj + 1, () => {
      push(`<< /Length ${content.length} >>\nstream\n`);
      push(content);
      push("\nendstream");
    });
  });
  const total = firstPage + pages.length * 2;
  const xref = chunks.length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let n = 1; n < total; n++) push(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Uint8Array(chunks);
}
