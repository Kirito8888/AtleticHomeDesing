import { describe, expect, it } from "vitest";

import { convertQuantity, madridDay, parseAppleInstant, parseLocaleNumber } from "./apple-units";

describe("parseLocaleNumber", () => {
  it("coma decimal, miles y mezcla", () => {
    expect(parseLocaleNumber("7,2", "km")).toBe(7.2);
    expect(parseLocaleNumber("1.234,5", "km")).toBe(1234.5);
    expect(parseLocaleNumber("1,234.5", "km")).toBe(1234.5);
    expect(parseLocaleNumber("1 234", "kcal")).toBe(1234);
    expect(parseLocaleNumber("1 234", "kcal")).toBe(1234);
  });
  it("«1.234»: miles en kcal, decimal en km", () => {
    expect(parseLocaleNumber("1.234", "kcal")).toBe(1234);
    expect(parseLocaleNumber("1.234", "km")).toBe(1.234);
    expect(parseLocaleNumber("62.300", "kg")).toBe(62.3);
  });
  it("no numérico → null", () => {
    expect(parseLocaleNumber("abc", "kcal")).toBeNull();
    expect(parseLocaleNumber("", "kcal")).toBeNull();
  });
});

describe("convertQuantity", () => {
  it("energía", () => {
    expect(convertQuantity("480 kcal", "kcal")).toBe(480);
    expect(convertQuantity("2.008 kJ", "kcal")).toBeCloseTo(479.9, 0);
    expect(convertQuantity("2008 kJ", "kcal") as number).toBeCloseTo(479.92, 1);
    expect(convertQuantity("1.234", "kcal")).toBe(1234);
  });
  it("distancia", () => {
    expect(convertQuantity("7,2 km", "m")).toBeCloseTo(7200);
    expect(convertQuantity("7200 m", "km")).toBeCloseTo(7.2);
    expect(convertQuantity("1 mi", "km") as number).toBeCloseTo(1.609, 3);
    expect(convertQuantity("1.234 km", "m")).toBeCloseTo(1234 * 1000, -2);
  });
  it("duración", () => {
    expect(convertQuantity("7 h 32 min", "min")).toBe(452);
    expect(convertQuantity("1:05:00", "min")).toBe(65);
    expect(convertQuantity("45:12", "s")).toBe(2712);
    expect(convertQuantity("90 s", "min")).toBe(1.5);
    expect(convertQuantity("1,5 h", "min")).toBe(90);
  });
  it("FC, VFC y peso", () => {
    expect(convertQuantity("52 lpm", "bpm")).toBe(52);
    expect(convertQuantity("52 count/min", "bpm")).toBe(52);
    expect(convertQuantity("48 ms", "ms")).toBe(48);
    expect(convertQuantity("0,048 s", "ms")).toBe(48);
    expect(convertQuantity("62,3 kg", "kg")).toBe(62.3);
    expect(convertQuantity("62300 g", "kg")).toBe(62.3);
    expect(convertQuantity("137 lb", "kg") as number).toBeCloseTo(62.14, 1);
  });
  it("número desnudo = unidad del campo; vacío = undefined; unidad errónea = error", () => {
    expect(convertQuantity(7.5, "kg")).toBe(7.5);
    expect(convertQuantity("", "kg")).toBeUndefined();
    expect(convertQuantity(null, "kg")).toBeUndefined();
    expect(typeof convertQuantity("5 km", "kg")).toBe("string");
    expect(typeof convertQuantity("hola", "kcal")).toBe("string");
  });
});

describe("parseAppleInstant", () => {
  it("ISO con desfase y formato Apple", () => {
    expect(parseAppleInstant("2026-11-22T07:30:00+01:00")?.toISOString()).toBe("2026-11-22T06:30:00.000Z");
    expect(parseAppleInstant("2026-11-22 07:30:00 +0100")?.toISOString()).toBe("2026-11-22T06:30:00.000Z");
    expect(parseAppleInstant("2026-11-22T06:30:00Z")?.toISOString()).toBe("2026-11-22T06:30:00.000Z");
  });
  it("sin desfase = hora de pared en Madrid (invierno y verano)", () => {
    expect(parseAppleInstant("2026-11-22T07:30:00")?.toISOString()).toBe("2026-11-22T06:30:00.000Z");
    expect(parseAppleInstant("2026-07-10T07:30:00")?.toISOString()).toBe("2026-07-10T05:30:00.000Z");
  });
  it("cambios de hora", () => {
    // 29/3/2026 02:30 no existe en Madrid → se adelanta
    expect(parseAppleInstant("2026-03-29T02:30:00")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // 25/10/2026 02:30 se repite → la primera (verano, +02:00)
    expect(parseAppleInstant("2026-10-25T02:30:00")?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });
  it("día de Madrid cerca de medianoche", () => {
    expect(madridDay(parseAppleInstant("2026-11-21T23:50:00+01:00")!)).toBe("2026-11-21");
    expect(madridDay(parseAppleInstant("2026-11-21T23:10:00Z")!)).toBe("2026-11-22"); // 00:10 en Madrid
    expect(madridDay(parseAppleInstant("2026-07-21T22:10:00Z")!)).toBe("2026-07-22"); // 00:10 en verano
    expect(madridDay(parseAppleInstant("2026-11-22T00:10:00")!)).toBe("2026-11-22");
  });
  it("basura → null", () => {
    expect(parseAppleInstant("ayer")).toBeNull();
    expect(parseAppleInstant("2026-13-40T00:00:00")).toBeNull();
    expect(parseAppleInstant("2026-02-30T10:00:00")).toBeNull();
  });
});
