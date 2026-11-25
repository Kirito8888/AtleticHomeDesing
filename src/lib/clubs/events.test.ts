import { describe, expect, it } from "vitest";

import { attendanceSummary, eventCreateSchema, madridWallToInstant, rsvpSchema } from "./events";

describe("madridWallToInstant", () => {
  it("verano (UTC+2) e invierno (UTC+1)", () => {
    expect(madridWallToInstant("2026-07-10T18:30")?.toISOString()).toBe("2026-07-10T16:30:00.000Z");
    expect(madridWallToInstant("2026-12-10T18:30")?.toISOString()).toBe("2026-12-10T17:30:00.000Z");
  });
  it("rechaza fechas imposibles y formatos raros", () => {
    for (const v of ["2026-02-30T10:00", "2026-13-01T10:00", "2026-07-10T25:00", "2026-07-10", "mañana"]) expect(madridWallToInstant(v), v).toBeNull();
  });
});

describe("esquemas", () => {
  it("evento con y sin cuota", () => {
    expect(eventCreateSchema.safeParse({ title: " Entreno ", startsAt: "2026-12-01T19:00", amount: "10,50" }).success).toBe(true);
    expect(eventCreateSchema.safeParse({ title: "Entreno", startsAt: "2026-12-01T19:00" }).success).toBe(true);
    expect(eventCreateSchema.safeParse({ title: "Entreno", startsAt: "2026-12-01T19:00", amount: "abc" }).success).toBe(false);
    expect(eventCreateSchema.safeParse({ title: "", startsAt: "2026-12-01T19:00" }).success).toBe(false);
  });
  it("respuesta", () => {
    expect(rsvpSchema.safeParse({ answer: "MAYBE" }).success).toBe(true);
    expect(rsvpSchema.safeParse({ answer: "TAL VEZ" }).success).toBe(false);
  });
});

describe("attendanceSummary", () => {
  it("cuenta y reparte los nombres; quien no responde va a «sin respuesta»", () => {
    const members = [{ id: "a", name: "Ana" }, { id: "b", name: "Bea" }, { id: "c", name: "Cris" }, { id: "d", name: "Dora" }];
    const s = attendanceSummary([{ memberId: "a", answer: "YES" }, { memberId: "b", answer: "NO" }, { memberId: "zz", answer: "YES" }], members);
    expect([s.yes, s.no, s.maybe, s.none]).toEqual([1, 1, 0, 2]);
    expect(s.names.NONE).toEqual(["Cris", "Dora"]);
  });
});
