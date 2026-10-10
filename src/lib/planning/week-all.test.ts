import { describe, expect, it } from "vitest";

import { classesInWeek, groupWeek, hhmm } from "@/lib/planning/week-all";

describe("vista semanal unificada", () => {
  it("agrupa por día y ordena por hora", () => {
    const w = groupWeek(
      [
        { date: "2026-10-07", min: 1080, kind: "training", title: "Fuerza" },
        { date: "2026-10-07", min: 540, kind: "class", title: "Anatomía" },
        { date: "2026-10-07", min: null, kind: "assignment", title: "Práctica 2" },
        { date: "2026-10-20", min: null, kind: "exam", title: "Fuera" },
      ],
      "2026-10-05",
    );
    expect(w).toHaveLength(7);
    expect(w[2].items.map((i) => i.title)).toEqual(["Práctica 2", "Anatomía", "Fuerza"]);
    expect(w.flatMap((d) => d.items)).toHaveLength(3);
  });
  it("clases semanales dentro de su periodo", () => {
    const c = classesInWeek(
      [
        { subject: "Fisiología", weekday: 1, startMin: 600, validFrom: "2026-09-01", validTo: "2027-01-31", location: "A2" },
        { subject: "Antigua", weekday: 2, startMin: 600, validFrom: null, validTo: "2026-06-30", location: null },
        { subject: "Examen", weekday: null, startMin: 600, validFrom: null, validTo: null, location: null },
      ],
      "2026-10-05",
    );
    expect(c).toEqual([{ date: "2026-10-06", min: 600, kind: "class", title: "Fisiología · A2" }]);
    expect(hhmm(545)).toBe("09:05");
  });
});
