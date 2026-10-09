import { describe, expect, it } from "vitest";

import { appointmentSchema, supplementsToCheck } from "./health-admin";

describe("suplementos y citas", () => {
  it("recuerda comprobar los activos sin revisar en 90 días", () => {
    const r = supplementsToCheck(
      [
        { id: "a", name: "Creatina", endedOn: null, checkedOn: null },
        { id: "b", name: "Vitamina D", endedOn: null, checkedOn: "2026-09-01" },
        { id: "c", name: "Hierro", endedOn: null, checkedOn: "2026-05-01" },
        { id: "d", name: "Antiguo", endedOn: "2026-06-01", checkedOn: null },
      ],
      "2026-10-08",
    );
    expect(r.map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("valida la cita", () => {
    expect(appointmentSchema.safeParse({ kind: "PHYSIO", at: "2026-10-10T17:00:00+02:00" }).success).toBe(true);
    expect(appointmentSchema.safeParse({ kind: "X", at: "2026-10-10" }).success).toBe(false);
  });
});
