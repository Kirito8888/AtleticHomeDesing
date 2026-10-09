import { describe, expect, it } from "vitest";

import { RETENTION_DEFAULTS, retentionDays } from "./retention";

describe("plazos de conservación", () => {
  it("usa los valores por defecto y acepta solo números válidos de las variables", () => {
    expect(retentionDays({})).toEqual(RETENTION_DEFAULTS);
    const d = retentionDays({ RETENTION_AUDIT_DAYS: "365", RETENTION_SAFETY_TRIPS_DAYS: "0", RETENTION_NOTIFICATIONS_DAYS: "abc" });
    expect(d.AUDIT).toBe(365);
    expect(d.SAFETY_TRIPS).toBe(RETENTION_DEFAULTS.SAFETY_TRIPS);
    expect(d.NOTIFICATIONS).toBe(RETENTION_DEFAULTS.NOTIFICATIONS);
  });
});
