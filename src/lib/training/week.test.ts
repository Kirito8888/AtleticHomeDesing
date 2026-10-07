import { describe, expect, it } from "vitest";

import { weekGrid } from "./week";

describe("vista semanal", () => {
  it("hecho, pendiente, perdido, saltado y descanso", () => {
    const g = weekGrid(
      [
        { date: "2026-10-05", status: "COMPLETED" },
        { date: "2026-10-06", status: "PLANNED" },
        { date: "2026-10-07", status: "SKIPPED" },
        { date: "2026-10-09", status: "PLANNED" },
      ],
      "2026-10-05",
      "2026-10-07",
    );
    expect(g.map((d) => `${d.label}:${d.state}`)).toEqual(["L:done", "M:missed", "X:skipped", "J:rest", "V:pending", "S:rest", "D:rest"]);
  });
});
