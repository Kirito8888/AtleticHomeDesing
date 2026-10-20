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

describe("format · es-ES con zona fija", () => {
  const sp = (s: string) => s.replace(/\s/g, " ");
  it("decimales con coma y miles con punto", async () => {
    const { formatDec, formatInt, formatBytes, formatMoney } = await import("./format");
    expect(formatDec(7.5, 1)).toBe("7,5");
    expect(formatDec(7.25, 2)).toBe("7,25");
    expect(formatDec(3, 2)).toBe("3,00");
    expect(formatDec(null, 1)).toBe("—");
    expect(formatInt(12345.4)).toBe("12.345");
    expect(formatBytes(1572864)).toBe("1,5 MB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(sp(formatMoney(1250, "USD"))).toMatch(/12,50/);
  });
  it("instantes en Europe/Madrid, no en la zona del proceso", async () => {
    const { formatDateTime, formatTime, formatMonth } = await import("./format");
    // 23:30 UTC de verano ya es el día siguiente (01:30) en Madrid
    const t = new Date("2026-07-14T23:30:00Z");
    expect(formatTime(t)).toBe("01:30");
    expect(formatDateTime(t, { day: "numeric", month: "short" })).toMatch(/15/);
    // invierno: UTC+1
    expect(formatTime(new Date("2026-12-01T23:30:00Z"))).toBe("00:30");
    expect(formatMonth("2026-10", "long")).toBe("octubre de 2026");
  });
});
