import { describe, expect, it } from "vitest";

import { testStamp } from "./stamp";

describe("testStamp", () => {
  it("da enteros seguros y distintos", () => {
    const xs = Array.from({ length: 1000 }, testStamp);
    expect(xs.every(Number.isSafeInteger)).toBe(true);
    expect(new Set(xs).size).toBe(1000);
  });
});
