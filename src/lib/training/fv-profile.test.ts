import { describe, expect, it } from "vitest";

import { computeFvProfile, FV_MIN_R2, fvSeriesSchema, type FvLoad, optimalSlope, predictedHeightM, pushOff } from "./fv-profile";
import { G, jumpHeight } from "./jump";

const M = 70;
const HPO = 0.4;
/** Series sintética a partir de un perfil dado: la altura de cada carga sale del propio modelo. */
const series = (F0: number, V0: number, adds: number[], m = M, hpo = HPO): FvLoad[] =>
  adds.map((addedKg) => ({ addedKg, heightCm: predictedHeightM(F0, V0, hpo, (m + addedKg) / m) * 100 }));

describe("pushOff (Samozino et al., 2008)", () => {
  it("salto de 30 cm, 70 kg, hPO 40 cm: números a mano", () => {
    const p = pushOff(M, HPO, { addedKg: 0, heightCm: 30 });
    expect(p.force * M).toBeCloseTo(M * G * (0.3 / 0.4 + 1), 6); // 1201,7 N
    expect(p.force * M).toBeCloseTo(1201.7, 0);
    expect(p.velocity).toBeCloseTo(Math.sqrt((G * 0.3) / 2), 6); // 1,213 m/s
    expect(p.power * M).toBeCloseTo(1457.7, 0);
  });
  it("reutiliza jumpHeight: la altura se recupera del tiempo de vuelo", () => {
    const p = pushOff(M, HPO, { addedKg: 20, heightCm: 24 });
    expect(jumpHeight(p.flightS)).toBeCloseTo(0.24, 9);
  });
});

describe("computeFvProfile", () => {
  it("recupera F0, V0 y Pmax de un perfil conocido", () => {
    const F0 = 30, V0 = 3.2;
    const r = computeFvProfile({ bodyMassKg: M, hpoCm: 40, loads: series(F0, V0, [0, 20, 40, 60]) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.F0).toBeCloseTo(F0, 1);
    expect(r.profile.V0).toBeCloseTo(V0, 1);
    expect(r.profile.pmax).toBeCloseTo((F0 * V0) / 4, 0);
    expect(r.profile.r2).toBeGreaterThan(0.99);
  });

  it("el óptimo es el máximo: perfil con pendiente óptima → desequilibrio ≈ 0", () => {
    const pmax = 22;
    const S = optimalSlope(pmax, HPO);
    const a = -S;
    const F0 = 2 * Math.sqrt(pmax * a), V0 = 2 * Math.sqrt(pmax / a);
    // la altura con perfil óptimo no es menor que con perfiles vecinos de la misma Pmax
    const h = (aa: number) => predictedHeightM(2 * Math.sqrt(pmax * aa), 2 * Math.sqrt(pmax / aa), HPO);
    expect(h(a)).toBeGreaterThanOrEqual(h(a * 1.1));
    expect(h(a)).toBeGreaterThanOrEqual(h(a / 1.1));
    const r = computeFvProfile({ bodyMassKg: M, hpoCm: 40, loads: series(F0, V0, [0, 25, 50, 75]) });
    expect(r.ok && r.profile.imbalancePct).toBeLessThan(2);
    expect(r.ok && r.profile.imbalance).toBe("balanced");
  });

  it("déficit de fuerza (pendiente poco inclinada) y de velocidad (muy inclinada)", () => {
    const pmax = 22;
    const Sopt = -optimalSlope(pmax, HPO);
    const mk = (factor: number) => {
      const a = Sopt * factor;
      return computeFvProfile({ bodyMassKg: M, hpoCm: 40, loads: series(2 * Math.sqrt(pmax * a), 2 * Math.sqrt(pmax / a), [0, 25, 50, 75]) });
    };
    const flat = mk(0.5);
    const steep = mk(2);
    expect(flat.ok && flat.profile.deficit).toBe("force");
    expect(flat.ok && flat.profile.imbalance).not.toBe("balanced");
    expect(steep.ok && steep.profile.deficit).toBe("velocity");
    expect(steep.ok && steep.profile.imbalancePct).toBeGreaterThan(40);
    expect(steep.ok && steep.profile.imbalance).toBe("high");
  });

  it("con 2 cargas calcula y avisa de que r² es 1 por construcción", () => {
    const r = computeFvProfile({ bodyMassKg: M, hpoCm: 40, loads: series(30, 3.2, [0, 40]) });
    expect(r.ok && r.warnings[0]).toMatch(/2 cargas/);
  });

  it("avisa si la regresión es mala, pero la da", () => {
    const loads = series(30, 3.2, [0, 20, 40, 60]);
    loads[1] = { ...loads[1], heightCm: loads[1].heightCm * 0.75 };
    const r = computeFvProfile({ bodyMassKg: M, hpoCm: 40, loads });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.profile.r2).toBeLessThan(FV_MIN_R2);
      expect(r.warnings.join(" ")).toMatch(/ajusta mal/);
    }
  });

  it("mensajes claros: menos de 2 cargas, cargas iguales, pendiente positiva", () => {
    const one = computeFvProfile({ bodyMassKg: M, hpoCm: 40, loads: [{ addedKg: 0, heightCm: 30 }] });
    expect(!one.ok && one.error).toMatch(/al menos 2/);
    const same = computeFvProfile({ bodyMassKg: M, hpoCm: 40, loads: [{ addedKg: 20, heightCm: 30 }, { addedKg: 20, heightCm: 28 }] });
    expect(!same.ok && same.error).toMatch(/distintas/);
    const up = computeFvProfile({ bodyMassKg: M, hpoCm: 40, loads: [{ addedKg: 0, heightCm: 20 }, { addedKg: 40, heightCm: 30 }] });
    expect(!up.ok && up.error).toMatch(/más carga/i);
  });
});

describe("fvSeriesSchema", () => {
  const ok = { date: "2026-10-17", bodyMassKg: 70, hpoCm: 40, loads: [{ addedKg: 0, heightCm: 30 }, { addedKg: 20, heightCm: 24 }] };
  it("acepta 2–4 cargas y rechaza 1 o 5", () => {
    expect(fvSeriesSchema.safeParse(ok).success).toBe(true);
    expect(fvSeriesSchema.safeParse({ ...ok, loads: ok.loads.slice(0, 1) }).success).toBe(false);
    expect(fvSeriesSchema.safeParse({ ...ok, loads: Array(5).fill(ok.loads[0]) }).success).toBe(false);
  });
});
