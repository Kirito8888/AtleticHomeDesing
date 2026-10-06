import { describe, expect, it } from "vitest";

import { adjust, formatRest, idle, pause, remainingMs, resume, start, tick } from "./rest-timer";

describe("temporizador de descanso", () => {
  it("cuenta hacia atrás desde la hora de fin y termina", () => {
    let t = start(idle(90), 0);
    expect(remainingMs(t, 30_000)).toBe(60_000);
    t = tick(t, 89_999);
    expect(t.status).toBe("running");
    t = tick(t, 90_000);
    expect(t.status).toBe("done");
    expect(remainingMs(t, 95_000)).toBe(0);
  });

  it("pausa y reanuda sin perder tiempo", () => {
    let t = start(idle(120), 0);
    t = pause(t, 20_000); // quedan 100 s
    expect(remainingMs(t, 500_000)).toBe(100_000); // en pausa no corre
    t = resume(t, 500_000);
    expect(remainingMs(t, 510_000)).toBe(90_000);
  });

  it("+30 s alarga el descanso en curso; nunca baja de 0", () => {
    let t = start(idle(60), 0);
    t = adjust(t, 30, 10_000);
    expect(remainingMs(t, 10_000)).toBe(80_000);
    t = adjust(t, -500, 10_000);
    expect(remainingMs(t, 10_000)).toBe(0);
  });

  it("reiniciar con otra duración", () => {
    const t = start(start(idle(60), 0), 5_000, 180);
    expect(t.durationSec).toBe(180);
    expect(remainingMs(t, 5_000)).toBe(180_000);
  });

  it("formato m:ss redondeando hacia arriba", () => {
    expect(formatRest(95_000)).toBe("1:35");
    expect(formatRest(59_001)).toBe("1:00");
    expect(formatRest(0)).toBe("0:00");
  });
});
