import { unzipSync } from "fflate";

import { pdfLines } from "./extract";
import { parsePlanPdf } from "./parse";
import type { ParsedMeso } from "./types";

export class PlanImportError extends Error {}

export const PLAN_LIMITS = {
  /** Tamaño máximo de lo que se sube (zip o PDF sueltos). */
  uploadBytes: 30 * 1024 * 1024,
  /** Entradas máximas dentro del zip y tamaño total descomprimido (anti «zip bomb»). */
  zipEntries: 40,
  unzippedBytes: 60 * 1024 * 1024,
  pdfBytes: 20 * 1024 * 1024,
  pdfPages: 120,
} as const;

export type UploadFile = { name: string; bytes: Uint8Array };
export type ParsedUpload = { mesos: ParsedMeso[]; skipped: Array<{ name: string; reason: string }> };

const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isPdf = (b: Uint8Array) => new TextDecoder("latin1").decode(b.subarray(0, 1024)).includes("%PDF-");
const baseName = (n: string) => n.split(/[\\/]/).pop() ?? n;

/** Abre un zip y devuelve solo sus PDF, con límites de número y de tamaño descomprimido. */
export function pdfsFromZip(bytes: Uint8Array): UploadFile[] {
  let entries = 0;
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith("/") || f.name.startsWith("__MACOSX/") || baseName(f.name).startsWith(".")) return false;
        if (!/\.pdf$/i.test(f.name)) return false;
        if (++entries > PLAN_LIMITS.zipEntries) throw new PlanImportError(`El zip tiene más de ${PLAN_LIMITS.zipEntries} PDF.`);
        if (f.originalSize > PLAN_LIMITS.pdfBytes) throw new PlanImportError(`«${baseName(f.name)}» es demasiado grande.`);
        total += f.originalSize;
        if (total > PLAN_LIMITS.unzippedBytes) throw new PlanImportError("El zip descomprimido ocupa demasiado.");
        return true;
      },
    });
  } catch (e) {
    if (e instanceof PlanImportError) throw e;
    throw new PlanImportError("No se pudo abrir el zip (¿está dañado o cifrado?).");
  }
  return Object.entries(files)
    .map(([name, b]) => ({ name: baseName(name), bytes: b }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

/**
 * Lee lo que sube el usuario (un zip o varios PDF) y devuelve los mesociclos
 * reconocidos. Los PDF que no son «día a día» se listan como omitidos.
 */
export async function parsePlanUpload(files: UploadFile[]): Promise<ParsedUpload> {
  const pdfs: UploadFile[] = [];
  const skipped: ParsedUpload["skipped"] = [];
  for (const f of files) {
    if (isZip(f.bytes)) pdfs.push(...pdfsFromZip(f.bytes));
    else if (isPdf(f.bytes)) pdfs.push(f);
    else skipped.push({ name: f.name, reason: "No es un PDF ni un zip." });
  }
  const mesos: ParsedMeso[] = [];
  for (const f of pdfs) {
    let parsed: ParsedMeso | null = null;
    try {
      parsed = parsePlanPdf(await pdfLines(f.bytes, PLAN_LIMITS.pdfPages));
    } catch {
      skipped.push({ name: f.name, reason: "No se pudo leer el PDF." });
      continue;
    }
    if (!parsed) skipped.push({ name: f.name, reason: "No es un PDF «día a día» (falta la cabecera «M5 · … · 26/10 – 22/11/2026»)." });
    else if (!parsed.days.length) skipped.push({ name: f.name, reason: "No se encontró ningún día." });
    else if (mesos.some((m) => m.code === parsed.code)) skipped.push({ name: f.name, reason: `${parsed.code} está repetido.` });
    else mesos.push(parsed);
  }
  mesos.sort((a, b) => a.start.localeCompare(b.start));
  return { mesos, skipped };
}
