// v3.2 Q · recordatorios de asistencia: reglas puras.
import { describe, expect, it } from "vitest";

import { inSendHours, reminderDue, reminderText, summaryText } from "./event-reminders";

const H = 3600e3;
const now = new Date("2026-12-10T11:00:00Z"); // 12:00 Madrid
const created = new Date(now.getTime() - 24 * H);

describe("recordatorios de eventos (puro)", () => {
  it("ventana: entre 2 h y 72 h antes, y el evento debe tener ≥ 6 h", () => {
    const at = (h: number) => ({ startsAt: new Date(now.getTime() + h * H), createdAt: created });
    expect(reminderDue(at(1), now)).toBe(false);
    expect(reminderDue(at(2), now)).toBe(true);
    expect(reminderDue(at(72), now)).toBe(true);
    expect(reminderDue(at(73), now)).toBe(false);
    expect(reminderDue({ startsAt: new Date(now.getTime() + 10 * H), createdAt: new Date(now.getTime() - 5 * H) }, now)).toBe(false);
  });
  it("franja de envío 9:00–21:00 de Madrid (también para menores)", () => {
    expect(inSendHours(new Date("2026-12-10T07:30:00Z"))).toBe(false); // 08:30
    expect(inSendHours(new Date("2026-12-10T08:00:00Z"))).toBe(true); // 09:00
    expect(inSendHours(new Date("2026-12-10T19:59:00Z"))).toBe(true); // 20:59
    expect(inSendHours(new Date("2026-12-10T20:00:00Z"))).toBe(false); // 21:00
    expect(inSendHours(new Date("2026-12-10T22:00:00Z"))).toBe(false);
  });
  it("el texto solo lleva club, título, fecha y hora: ni importe ni recuentos", () => {
    const m = reminderText({ id: "c1", name: "Club A" }, { id: "e1", title: "Competición", startsAt: new Date("2026-12-12T17:00:00Z") });
    expect(m.body).toBe("¿Vas a «Competición» el 12/12 a las 18:00? Responde en un toque.");
    expect(m.url).toBe("/clubs/c1");
    expect(JSON.stringify(m)).not.toMatch(/€|cuota|sin responder/i);
  });
  it("el resumen del staff son solo recuentos", () => {
    const m = summaryText({ id: "c1", name: "Club A" }, { id: "e1", title: "Torneo" }, { yes: 3, no: 1, maybe: 2, none: 4 });
    expect(m.body).toBe("«Torneo»: 3 sí, 1 no, 2 quizá, 4 sin responder.");
  });
});
