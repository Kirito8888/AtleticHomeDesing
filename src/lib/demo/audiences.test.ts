import { describe, expect, it } from "vitest";

import { routineAnswersSchema } from "@/lib/routine/questionnaire";

import { AUDIENCES, type Audience, demoSeries, SPECS } from "./audiences";

describe("cuentas demo v1.7", () => {
  it("series deterministas, con pasado hecho y semana planificada", () => {
    const a = demoSeries("RUNNER", "2026-10-10");
    expect(demoSeries("RUNNER", "2026-10-10")).toEqual(a);
    expect(a.recovery).toHaveLength(28);
    expect(a.sessions.some((s) => s.status === "PLANNED" && s.date > "2026-10-10")).toBe(true);
    expect(a.sessions.filter((s) => s.status === "COMPLETED").every((s) => s.date <= "2026-10-10" && s.sessionRpe != null)).toBe(true);
  });

  it("los cuestionarios de ejemplo son válidos", () => {
    for (const k of Object.keys(AUDIENCES) as Audience[]) {
      const r = SPECS[k].routine;
      if (r) expect(routineAnswersSchema.safeParse({ ...r, startDate: "2026-10-12" }).success, k).toBe(true);
    }
  });
});
