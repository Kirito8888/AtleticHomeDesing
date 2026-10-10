/**
 * v1.8 · «Compartir con Atlenza» (share target de la PWA).
 *
 * El service worker recibe el POST del sistema, guarda los ficheros en Cache Storage
 * (SHARE_CACHE) y abre /share. Allí se elige el destino según el tipo; la página de
 * destino recoge el fichero con ?shared=<destino>. Nada pasa por el servidor hasta que
 * la usuaria confirma en la pantalla de importación de siempre.
 */
export const SHARE_CACHE = "lifeos-share";

export type ShareTarget = "competitions" | "plan" | "bank" | "document" | "injury" | "receipt";

export const SHARE_TARGETS: Record<ShareTarget, { label: string; href: string; hint: string }> = {
  competitions: { label: "Calendario de competiciones", href: "/planning?shared=competitions#competiciones", hint: ".ics o CSV «fecha;nombre;lugar»" },
  plan: { label: "Planificación (PDF o zip)", href: "/planning?shared=plan", hint: "Se analiza y ves la vista previa antes de importar" },
  bank: { label: "Extracto del banco", href: "/finance?shared=bank", hint: "CSV o Norma 43; eliges la cuenta" },
  document: { label: "Apuntes para estudiar", href: "/study?shared=document", hint: "PDF, texto o Markdown" },
  injury: { label: "Foto de una molestia", href: "/recovery?shared=injury", hint: "Eliges a qué molestia; se guarda cifrada y sin EXIF" },
  receipt: { label: "Justificante de un gasto", href: "/finance?shared=receipt#movimientos", hint: "Eliges el movimiento; se guarda cifrado" },
};

/** Destinos posibles de un fichero, el más probable primero. Puro: se prueba sin navegador. */
export function shareTargetsFor(name: string, type: string): ShareTarget[] {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const t = type.toLowerCase();
  if (ext === "ics" || t === "text/calendar") return ["competitions"];
  if (ext === "zip" || t === "application/zip" || t === "application/x-zip-compressed") return ["plan"];
  if (ext === "pdf" || t === "application/pdf") return ["plan", "document", "receipt"];
  if (t.startsWith("image/")) return ["injury", "receipt"];
  if (ext === "n43" || ext === "aeb") return ["bank"];
  if (ext === "csv" || t === "text/csv") return ["bank", "competitions"];
  if (ext === "md" || ext === "markdown" || ext === "txt" || t.startsWith("text/")) return ["document", "bank"];
  return [];
}
