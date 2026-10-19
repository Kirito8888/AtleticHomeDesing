import { describe, expect, it } from "vitest";

import { daysLeftOut, defaultMultiStart } from "./multi-start";

describe("defaultMultiStart", () => {
  it("sábado → el lunes siguiente", () => expect(defaultMultiStart("2026-10-24")).toBe("2026-10-26"));
  it("domingo → el lunes siguiente", () => expect(defaultMultiStart("2026-10-25")).toBe("2026-10-26"));
  it("lunes → ese mismo lunes", () => expect(defaultMultiStart("2026-10-19")).toBe("2026-10-19"));
  it("miércoles → el lunes siguiente", () => expect(defaultMultiStart("2026-10-21")).toBe("2026-10-26"));
  it("cruza de mes y de año", () => {
    expect(defaultMultiStart("2026-10-31")).toBe("2026-11-02");
    expect(defaultMultiStart("2026-12-30")).toBe("2027-01-04");
  });
});

describe("daysLeftOut", () => {
  it("lunes: no queda nada fuera", () => expect(daysLeftOut("2026-10-19")).toEqual({ count: 0, label: "" }));
  it("martes: queda fuera el lunes", () => expect(daysLeftOut("2026-10-20")).toEqual({ count: 1, label: "lunes" }));
  it("miércoles: lunes y martes", () => expect(daysLeftOut("2026-10-21")).toEqual({ count: 2, label: "lunes y martes" }));
  it("domingo: seis días", () => expect(daysLeftOut("2026-10-25")).toEqual({ count: 6, label: "lunes, martes, miércoles, jueves, viernes y sábado" }));
});
