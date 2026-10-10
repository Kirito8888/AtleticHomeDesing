import { extractText } from "unpdf";

import { ApiError, enforceRateLimit, route } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { sniffFile } from "@/lib/files/sealed-files";
import { eventsFromPdfText, eventsFromRows, readXlsxRows } from "@/lib/planning/calendar-import";

const MAX = 5 * 1024 * 1024;

/** v1.10 · Lee el calendario de la federación o del club (Excel .xlsx o PDF) y devuelve las competiciones; no guarda nada. */
export const POST = route(async (req) => {
  const user = await requireUser();
  enforceRateLimit("import", user.id);
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Falta el fichero");
  if (file.size > MAX) throw new ApiError(413, "El fichero supera 5 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  if (sniffFile(buf) === "application/pdf") {
    const { text } = await extractText(new Uint8Array(buf), { mergePages: true });
    return { events: eventsFromPdfText(text).slice(0, 300) };
  }
  if (buf.subarray(0, 2).toString("latin1") === "PK") {
    try {
      return { events: eventsFromRows(readXlsxRows(new Uint8Array(buf))).slice(0, 300) };
    } catch (e) {
      throw new ApiError(422, (e as Error).message);
    }
  }
  throw new ApiError(415, "Formato no soportado: Excel (.xlsx) o PDF; .ics y CSV se leen directamente");
});
