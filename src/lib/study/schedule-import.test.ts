import { describe, expect, it } from "vitest";

import { parseIcsSchedule } from "./schedule-import";

const ics = (events: string[]) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.map((e) => `BEGIN:VEVENT\r\n${e}\r\nEND:VEVENT`).join("\r\n")}\r\nEND:VCALENDAR`;

describe("horario de la universidad (.ics)", () => {
  it("clases semanales con RRULE (varios días y UNTIL) y exámenes sueltos", () => {
    const r = parseIcsSchedule(
      ics([
        "SUMMARY:Bioquímica\r\nDTSTART;TZID=Europe/Madrid:20260914T090000\r\nDTEND;TZID=Europe/Madrid:20260914T110000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261218T235959Z\r\nLOCATION:Aula 2.1",
        "SUMMARY:Examen parcial Bioquímica\r\nDTSTART:20261105T080000Z\r\nDTEND:20261105T100000Z",
        "SUMMARY:Festivo\r\nDTSTART;VALUE=DATE:20261012",
      ]),
    );
    expect(r.slots).toEqual([
      { kind: "CLASS", subject: "Bioquímica", weekday: 0, start: "09:00", end: "11:00", validFrom: "2026-09-14", validTo: "2026-12-18", location: "Aula 2.1" },
      { kind: "CLASS", subject: "Bioquímica", weekday: 2, start: "09:00", end: "11:00", validFrom: "2026-09-14", validTo: "2026-12-18", location: "Aula 2.1" },
      // 08:00 UTC en noviembre = 09:00 en Madrid
      { kind: "EXAM", subject: "Examen parcial Bioquímica", date: "2026-11-05", start: "09:00", end: "11:00", location: undefined },
    ]);
    expect(r.ignored).toBe(1);
  });

  it("cada sesión exportada por separado se junta en una clase semanal; las sueltas se ignoran", () => {
    const r = parseIcsSchedule(
      ics([
        "SUMMARY:Fisiología\r\nDTSTART:20260915T120000\r\nDTEND:20260915T140000",
        "SUMMARY:Fisiología\r\nDTSTART:20260922T120000\r\nDTEND:20260922T140000",
        "SUMMARY:Fisiología\r\nDTSTART:20260929T120000\r\nDTEND:20260929T140000",
        "SUMMARY:Tutoría\r\nDTSTART:20260916T170000\r\nDTEND:20260916T173000",
      ]),
    );
    expect(r.slots).toEqual([{ kind: "CLASS", subject: "Fisiología", weekday: 1, start: "12:00", end: "14:00", validFrom: "2026-09-15", validTo: "2026-09-29", location: undefined }]);
    expect(r.ignored).toBe(1);
  });

  it("COUNT calcula el final", () => {
    const r = parseIcsSchedule(ics(["SUMMARY:Inglés\r\nDTSTART:20260917T100000\r\nDTEND:20260917T110000\r\nRRULE:FREQ=WEEKLY;COUNT=4"]));
    expect(r.slots[0]).toMatchObject({ weekday: 3, validFrom: "2026-09-17", validTo: "2026-10-14" });
  });
});
