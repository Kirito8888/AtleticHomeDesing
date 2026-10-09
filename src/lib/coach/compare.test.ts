import { describe, expect, it } from "vitest";

import { compareAthletes } from "./compare";

describe("panel multiatleta", () => {
  it("carga 7 días, cumplimiento 14 días y mejor marca 30 días, según permisos", () => {
    const sessions = [
      { date: "2026-10-07", status: "COMPLETED", sessionRpe: 6, durationSec: 3600, bestMarkM: 50 },
      { date: "2026-10-05", status: "PLANNED", sessionRpe: null, durationSec: null, bestMarkM: null },
      { date: "2026-09-20", status: "COMPLETED", sessionRpe: 5, durationSec: 1800, bestMarkM: 52 },
      { date: "2026-10-09", status: "PLANNED", sessionRpe: null, durationSec: null, bestMarkM: null },
    ];
    const [a, b] = compareAthletes(
      [
        { id: "a", name: "A", scopes: ["LOAD", "SESSIONS"], sessions },
        { id: "b", name: "B", scopes: ["SESSIONS"], sessions },
      ],
      "2026-10-08",
    );
    expect(a).toMatchObject({ load7: 360, compliancePct: 50, best30: 52 });
    expect(b).toMatchObject({ load7: null, compliancePct: 50, best30: null });
  });
});
