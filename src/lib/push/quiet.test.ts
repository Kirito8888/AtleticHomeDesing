import { describe, expect, it } from "vitest";

import { inQuietHours, isUrgent } from "./quiet";

describe("horas de silencio v1.8", () => {
  const at = (iso: string) => new Date(iso); // octubre: Madrid = UTC+2
  it("tramo que cruza la medianoche", () => {
    const q = { from: "22:30", to: "07:30" };
    expect(inQuietHours(at("2026-10-10T21:00:00Z"), q)).toBe(true); // 23:00
    expect(inQuietHours(at("2026-10-10T04:00:00Z"), q)).toBe(true); // 06:00
    expect(inQuietHours(at("2026-10-10T06:00:00Z"), q)).toBe(false); // 08:00
    expect(inQuietHours(at("2026-10-10T12:00:00Z"), null)).toBe(false);
  });
  it("tramo en el mismo día y avisos urgentes", () => {
    expect(inQuietHours(at("2026-10-10T12:30:00Z"), { from: "14:00", to: "16:00" })).toBe(true);
    expect(isUrgent("sec-PASSWORD_CHANGED")).toBe(true);
    expect(isUrgent("safety-abc")).toBe(true);
    expect(isUrgent("digest")).toBe(false);
  });
});
