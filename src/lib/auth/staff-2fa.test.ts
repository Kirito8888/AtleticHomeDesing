import { describe, expect, it } from "vitest";

import { staffSecondFactorState as st } from "./staff-2fa";

const now = new Date("2026-11-14T10:00:00Z");

describe("staffSecondFactorState", () => {
  it("las atletas y quien ya tiene segundo factor pasan siempre", () => {
    expect(st({ role: "ATHLETE", hasFactor: false, requiredFrom: "2000-01-01", now })).toEqual({ kind: "ok" });
    expect(st({ role: "COACH", hasFactor: true, requiredFrom: "2000-01-01", now })).toEqual({ kind: "ok" });
  });
  it("sin fecha de corte solo avisa", () => {
    expect(st({ role: "COACH", hasFactor: false, now })).toEqual({ kind: "grace", daysLeft: null, from: null });
  });
  it("con fecha futura da los días que quedan; el mismo día o después bloquea", () => {
    expect(st({ role: "ADMIN", hasFactor: false, requiredFrom: "2026-11-28", now })).toEqual({ kind: "grace", daysLeft: 14, from: "2026-11-28" });
    expect(st({ role: "ADMIN", hasFactor: false, requiredFrom: "2026-11-14", now })).toEqual({ kind: "blocked" });
    expect(st({ role: "COACH", hasFactor: false, requiredFrom: "2026-01-01", now })).toEqual({ kind: "blocked" });
  });
});
