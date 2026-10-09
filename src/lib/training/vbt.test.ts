import { describe, expect, it } from "vitest";

import { loadVelocityProfile, velocityLoss } from "./vbt";

// Valores inventados con relación lineal perfecta: v = 1,5 − 0,01 × kg
describe("VBT", () => {
  it("perfil carga-velocidad y RM a la velocidad mínima", () => {
    const p = loadVelocityProfile(
      [
        { kg: 40, v: 1.1 },
        { kg: 60, v: 0.9 },
        { kg: 80, v: 0.7 },
        { kg: 80, v: 0.7 },
      ],
      0.3,
    );
    expect(p).toMatchObject({ points: 4, slope: -0.01, intercept: 1.5, r2: 1, e1rm: 120, reliable: true });
    expect(loadVelocityProfile([{ kg: 40, v: 1 }, { kg: 60, v: 0.8 }], 0.3)).toBeNull(); // pocas cargas
    expect(loadVelocityProfile([{ kg: 40, v: 0.5 }, { kg: 60, v: 0.6 }, { kg: 80, v: 0.7 }], 0.3)).toBeNull(); // pendiente positiva
  });

  it("pérdida de velocidad desde la serie más rápida", () => {
    expect(velocityLoss([0.8, 0.82, 0.7, 0.65])).toBe(20.7);
    expect(velocityLoss([0.8])).toBeNull();
  });
});
