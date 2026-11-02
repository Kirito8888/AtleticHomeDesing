// Extracción de texto de presentaciones .pptx (un ZIP de XML). Sin dependencias de servidor: se puede probar suelta.
// Una «página» por diapositiva, en el orden de la presentación, con las notas del orador al final.
import { strFromU8, unzipSync } from "fflate";

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
/** Tope de lo que se descomprime (el fichero comprimido ya está limitado a 15 MB): corta las «bombas» de compresión. */
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_SLIDES = 500;

/** Firma ZIP y presencia de la parte principal de PowerPoint (los nombres de las partes van sin comprimir en las cabeceras). */
export function looksLikePptx(buf: Buffer): boolean {
  return buf.length > 30 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 && buf.includes("ppt/presentation.xml");
}

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const decode = (s: string) => s.replace(/&(?:amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, d, h) => (d ? String.fromCodePoint(+d) : h ? String.fromCodePoint(parseInt(h, 16)) : (ENT[m.toLowerCase()] ?? m)));

/** Texto de un XML de diapositiva o de notas: un párrafo (`a:p`) por línea, concatenando sus `a:t` y respetando los saltos (`a:br`). */
export function xmlText(xml: string): string {
  const lines: string[] = [];
  for (const p of xml.match(/<a:p[ >][\s\S]*?<\/a:p>/g) ?? []) {
    const parts = [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g)].map((m) => (m[0].startsWith("<a:br") ? "\n" : decode(m[1])));
    const t = parts.join("").replace(/[ \t]+\n/g, "\n").trim();
    if (t) lines.push(t);
  }
  return lines.join("\n");
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

function relMap(xml: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of xml?.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = attr(t, "Id");
    const target = attr(t, "Target");
    if (id && target) m.set(id, target);
  }
  return m;
}

/** Resuelve un destino relativo de un `.rels` (`../notesSlides/notesSlide1.xml`, `slides/slide1.xml`) contra la carpeta de origen. */
function resolve(fromDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const out = fromDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") out.pop();
    else if (seg && seg !== ".") out.push(seg);
  }
  return out.join("/");
}

/**
 * Páginas de texto de un .pptx: «Diapositiva N», su texto y «Notas» si las hay. Las diapositivas vacías se omiten.
 *
 * @throws {Error} si no es un ZIP válido, supera los topes de descompresión o no tiene diapositivas.
 */
export function extractPptxPages(buf: Buffer): string[] {
  let total = 0;
  const files = unzipSync(new Uint8Array(buf), {
    filter: (f) => {
      if (!/^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|notesSlides\/notesSlide\d+\.xml)$/.test(f.name)) return false;
      if (f.originalSize > MAX_ENTRY_BYTES) throw new Error("Una parte de la presentación es demasiado grande");
      total += f.originalSize;
      if (total > MAX_TOTAL_BYTES) throw new Error("La presentación es demasiado grande al descomprimirla");
      return true;
    },
  });
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : undefined);

  // Orden real de la presentación: sldIdLst → r:id → destino.
  let slides: string[] = [];
  const pres = read("ppt/presentation.xml");
  const rels = relMap(read("ppt/_rels/presentation.xml.rels"));
  for (const tag of pres?.match(/<p:sldId\b[^>]*>/g) ?? []) {
    const rid = attr(tag, "r:id");
    const target = rid ? rels.get(rid) : undefined;
    if (target) slides.push(resolve("ppt", target));
  }
  slides = slides.filter((s) => files[s]);
  if (!slides.length) slides = Object.keys(files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  if (!slides.length) throw new Error("La presentación no tiene diapositivas");

  const pages: string[] = [];
  slides.slice(0, MAX_SLIDES).forEach((name, i) => {
    const body = xmlText(read(name) ?? "");
    const dir = name.slice(0, name.lastIndexOf("/"));
    const relName = `${dir}/_rels/${name.slice(name.lastIndexOf("/") + 1)}.rels`;
    const noteTarget = [...relMap(read(relName)).values()].find((t) => /notesSlide/.test(t));
    const notes = noteTarget ? xmlText(read(resolve(dir, noteTarget)) ?? "") : "";
    if (!body && !notes) return;
    pages.push([`Diapositiva ${i + 1}`, body, notes ? `Notas: ${notes}` : ""].filter(Boolean).join("\n"));
  });
  return pages;
}
