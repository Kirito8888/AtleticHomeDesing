import { describe, expect, it } from "vitest";

import { detectJumps, motionFromFrames, type MotionSignal } from "./jump-detect";

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Señal sintética: ruido de fondo, picos al despegar/aterrizar y, opcionalmente, un contramovimiento previo. */
function synth(len: number, jumps: { takeoff: number; landing: number; countermove?: boolean }[], noise = 0.002, seed = 1): MotionSignal {
  const r = rng(seed);
  const sig: MotionSignal = Array.from({ length: len }, () => r() * noise);
  sig[0] = null;
  for (const j of jumps) {
    for (let k = 0; k < 5; k++) sig[j.takeoff + k] = 0.3 - k * 0.05 + r() * noise;
    for (let k = 0; k < 6; k++) sig[j.landing + k] = 0.4 - k * 0.05 + r() * noise;
    if (j.countermove) for (let i = j.takeoff - 70; i < j.takeoff - 30; i++) sig[i] = 0.03 + r() * noise;
  }
  return sig;
}

describe("detectJumps", () => {
  it("salto limpio a 240 fps: onsets exactos", () => {
    const r = detectJumps(synth(600, [{ takeoff: 200, landing: 320 }]), 240);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.jumps).toHaveLength(1);
      expect(r.jumps[0].takeoff).toBe(200);
      expect(r.jumps[0].landing).toBe(320);
      expect(r.jumps[0].confidence).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("con ruido de fondo mayor sigue dentro de ±1 fotograma", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = detectJumps(synth(600, [{ takeoff: 200, landing: 320 }], 0.006, seed), 240);
      expect(r.status).toBe("ok");
      if (r.status === "ok") {
        expect(Math.abs(r.jumps[0].takeoff - 200)).toBeLessThanOrEqual(1);
        expect(Math.abs(r.jumps[0].landing - 320)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("un contramovimiento previo no se confunde con el despegue", () => {
    const r = detectJumps(synth(600, [{ takeoff: 200, landing: 320, countermove: true }]), 240);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.jumps).toHaveLength(1);
      expect(r.jumps[0].takeoff).toBe(200);
      expect(r.jumps[0].landing).toBe(320);
    }
  });

  it("tres saltos en serie → tres propuestas ordenadas", () => {
    const js = [{ takeoff: 100, landing: 220 }, { takeoff: 700, landing: 810 }, { takeoff: 1300, landing: 1425 }];
    const r = detectJumps(synth(1600, js), 240);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.jumps.map((j) => [j.takeoff, j.landing])).toEqual(js.map((j) => [j.takeoff, j.landing]));
  });

  it("vídeo quieto → baja confianza, no propone", () => {
    const r = detectJumps(synth(600, []), 240);
    expect(r).toMatchObject({ status: "low" });
  });

  it("un solo pico → no propone", () => {
    const s = synth(600, []);
    for (let k = 0; k < 5; k++) s[200 + k] = 0.3;
    expect(detectJumps(s, 240).status).toBe("low");
  });

  it("vuelo de 2 s (no plausible) → no propone", () => {
    expect(detectJumps(synth(1200, [{ takeoff: 100, landing: 580 }]), 240).status).toBe("low");
  });

  it("los fps efectivos deciden la plausibilidad: 120 fotogramas son 0,5 s a 240 fps pero 4 s a 30 fps", () => {
    const s = synth(600, [{ takeoff: 200, landing: 320 }]);
    expect(detectJumps(s, 240).status).toBe("ok");
    expect(detectJumps(s, 30).status).toBe("low");
  });

  it("fotogramas sin leer se ignoran, pero demasiados anulan la propuesta", () => {
    const s = synth(600, [{ takeoff: 200, landing: 320 }]);
    for (let i = 10; i < 600; i += 20) s[i] = null;
    expect(detectJumps(s, 240).status).toBe("ok");
    const t = synth(600, [{ takeoff: 200, landing: 320 }]);
    for (let i = 10; i < 600; i += 3) t[i] = null;
    expect(detectJumps(t, 240)).toMatchObject({ status: "low", reason: expect.stringContaining("leer") });
  });

  it("señal demasiado corta", () => {
    expect(detectJumps([null, 0, 0], 240).status).toBe("low");
  });
});

describe("motionFromFrames", () => {
  it("sin fotograma previo → null", () => {
    expect(motionFromFrames(null, new Uint8ClampedArray(4))).toBeNull();
  });
  it("cuenta la fracción de píxeles que cambian por encima del umbral", () => {
    const a = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]);
    const b = new Uint8ClampedArray([5, 0, 100, 200, 0, 0, 13, 0]);
    expect(motionFromFrames(a, b, 12)).toBe(3 / 8);
    expect(motionFromFrames(a, a)).toBe(0);
  });
});
