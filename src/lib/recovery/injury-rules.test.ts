import { describe, expect, it } from "vitest";

import { injuryAlert } from "./injury-rules";

describe("aviso de lesiones", () => {
  const knee = { area: "KNEE" as const, side: "LEFT" as const, pain: 3, limitsTraining: false };

  it("sin molestias activas no avisa", () => {
    expect(injuryAlert([], 1.6)).toBeNull();
  });

  it("molestia + ACWR > 1,3 → aviso de reducir volumen", () => {
    const a = injuryAlert([knee], 1.42);
    expect(a?.level).toBe("warn");
    expect(a?.message).toContain("Rodilla (izquierda)");
    expect(a?.message).toContain("1,42");
  });

  it("dolor alto o que limita el entreno → aviso aunque la carga esté bien", () => {
    expect(injuryAlert([{ ...knee, pain: 7 }], 1.0)?.level).toBe("warn");
    expect(injuryAlert([{ ...knee, limitsTraining: true }], null)?.level).toBe("warn");
  });

  it("molestia leve con carga normal → solo informa", () => {
    expect(injuryAlert([knee, { ...knee, area: "ANKLE", side: null }], 1.1)).toEqual({
      level: "info",
      message: "2 molestias activas: Rodilla (izquierda), Tobillo.",
    });
  });
});
