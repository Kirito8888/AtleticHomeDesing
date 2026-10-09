import { describe, expect, it } from "vitest";

import { kgForReps, suggestKg } from "./autoreg";
import { estimateOneRm } from "./strength";

const opts = { maxPct: 5, step: 2.5, mvt: 0.3 };

describe("kg del día autorregulados", () => {
  it("kgForReps es la inversa de estimateOneRm", () => {
    for (const n of [1, 3, 5, 8, 12]) expect(kgForReps(estimateOneRm(100, n, 0)!, n)).toBeCloseTo(100, 6);
  });

  it("si la 1.ª serie sale como pedía el plan, mantiene los kg", () => {
    const s = suggestKg({ kg: 80, reps: 5, rir: 2 }, { kg: 80, reps: 5, rir: 2, velocityMs: null }, opts)!;
    expect(s.kg).toBe(80);
    expect(s.text).toMatch(/como pedía el plan/);
  });

  it("RIR más bajo de lo pedido → baja; más alto → sube; nunca más del tope", () => {
    expect(suggestKg({ kg: 80, reps: 5, rir: 2 }, { kg: 80, reps: 5, rir: 1, velocityMs: null }, opts)!.kg).toBe(77.5);
    expect(suggestKg({ kg: 80, reps: 5, rir: 2 }, { kg: 80, reps: 5, rir: 3, velocityMs: null }, opts)!.kg).toBe(82.5);
    const big = suggestKg({ kg: 80, reps: 5, rir: 2 }, { kg: 80, reps: 5, rir: 0, velocityMs: null }, opts)!;
    expect(big.kg).toBe(77.5); // pediría 75: se queda en el tope (−5 % = 76, al paso de 2,5 dentro del tope)
    expect(big.capped).toBe(true);
  });

  it("con velocidad y perfil usa la velocidad", () => {
    // Perfil: v = 1,3 − 0,01·kg → RM a 0,3 m/s = 100 kg. Hoy 80 kg a 0,4 m/s (lo normal: 0,5) → 1RM del día 90
    const s = suggestKg({ kg: 80, reps: 5, rir: 2 }, { kg: 80, reps: 5, rir: null, velocityMs: 0.4 }, { ...opts, profile: { slope: -0.01, intercept: 1.3 } })!;
    expect(s.source).toBe("velocity");
    expect(s.e1rmToday).toBe(90);
    expect(s.kg).toBe(77.5);
  });

  it("sin RIR ni velocidad no propone nada", () => {
    expect(suggestKg({ kg: 80, reps: 5, rir: 2 }, { kg: 80, reps: 5, rir: null, velocityMs: null }, opts)).toBeNull();
  });
});
