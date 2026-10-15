import { describe, expect, it } from "vitest";

import { shortWhen } from "@/components/settings/server-status";

describe("shortWhen", () => {
  it("no lanza con fechas inválidas", () => {
    expect(shortWhen("no-es-fecha")).toBe("—");
    expect(shortWhen("")).toBe("—");
  });
  it("formatea una fecha válida", () => {
    expect(shortWhen("2026-10-14T10:00:00.000Z")).toMatch(/14/);
  });
});
