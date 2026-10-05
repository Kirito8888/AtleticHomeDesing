import { describe, expect, it } from "vitest";

import { formatDuration, formatEur, parseDuration } from "./format";

describe("format", () => {
  it("duraciones", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(95)).toBe("1:35");
    expect(parseDuration("1:02:05")).toBe(3725);
    expect(parseDuration("45,3")).toBeCloseTo(45.3);
    expect(parseDuration("4:x")).toBeNull();
  });
  it("euros", () => {
    expect(formatEur(172052).replace(/\s/g, " ")).toBe("1720,52 €");
  });
});
