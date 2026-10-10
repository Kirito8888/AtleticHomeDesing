/**
 * Calendario iCalendar (RFC 5545) mínimo y de solo lectura: título, fecha y
 * lugar. Nada de descripciones ni datos de salud.
 */
export type IcsEvent = { uid: string; title: string; start: Date; end?: Date | null; allDay: boolean; location?: string | null };

const pad = (n: number) => String(n).padStart(2, "0");
const day = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const stamp = (d: Date) => `${day(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

/** Escapa texto según RFC 5545 (\\ ; , y saltos de línea). */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Pliega líneas de más de 75 octetos (continuación con un espacio). */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(name: string, events: IcsEvent[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlenza//Calendario//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`, "X-WR-TIMEZONE:Europe/Madrid"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@lifeos`, `DTSTAMP:${stamp(now)}`);
    if (e.allDay) {
      // DTEND es exclusivo: el día siguiente al último
      const last = e.end && e.end > e.start ? e.end : e.start;
      lines.push(`DTSTART;VALUE=DATE:${day(e.start)}`, `DTEND;VALUE=DATE:${day(new Date(last.getTime() + 864e5))}`);
    } else {
      lines.push(`DTSTART:${stamp(e.start)}`, `DTEND:${stamp(e.end && e.end > e.start ? e.end : new Date(e.start.getTime() + 3600e3))}`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
