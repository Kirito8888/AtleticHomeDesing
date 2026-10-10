import { describe, expect, it } from "vitest";

import { summaryLines } from "@/lib/review/review";

describe("summaryLines", () => {
  it("compara con la semana anterior", () => {
    const l = summaryLines({ sessions: 5, tss: 420, sleepH: 7.84, studyMin: 185, spentCents: 4550 }, { sessions: 4, tss: 350, sleepH: 7, studyMin: 0, spentCents: 0 });
    expect(l[0]).toBe("5 sesiones · TSS 420 (+20 % vs. la anterior)");
    expect(l[1]).toBe("Sueño medio: 7.8 h");
    expect(l[2]).toBe("Estudio: 3 h 5 min");
    expect(l[3]).toMatch(/45,50/);
  });
  it("sin semana anterior ni sueño", () => {
    const l = summaryLines({ sessions: 1, tss: 50, sleepH: null, studyMin: 0, spentCents: 0 }, null);
    expect(l[0]).toBe("1 sesión · TSS 50");
    expect(l[1]).toBe("Sin registros de sueño");
  });
});
