import { describe, expect, it } from "vitest";

import { clubSections, coachHubLinks } from "./club-layout";

describe("clubSections", () => {
  it("staff: alertas primero y cuotas solo para administradora", () => {
    expect(clubSections({ role: "COACH", hasPanel: true }).map((s) => s.id)).toEqual(["alertas", "cumplimiento", "calendario", "miembros"]);
    expect(clubSections({ role: "ADMIN", hasPanel: true }).map((s) => s.id)).toEqual(["alertas", "cumplimiento", "calendario", "miembros", "cuotas"]);
  });
  it("atleta: solo cuotas, sin paneles de staff", () => {
    expect(clubSections({ role: "ATHLETE", hasPanel: false }).map((s) => s.id)).toEqual(["cuotas"]);
  });
});

describe("coachHubLinks", () => {
  it("la atleta no ve «Mis atletas» ni planificar", () => {
    const hrefs = coachHubLinks({ role: "ATHLETE", canPlanAny: true }).map((l) => l.href);
    expect(hrefs).not.toContain("/coach");
    expect(hrefs).not.toContain("/coach/multi");
    expect(hrefs).toContain("/settings#entrenadora");
  });
  it("la entrenadora ve planificar solo si algún vínculo lo permite", () => {
    expect(coachHubLinks({ role: "COACH", canPlanAny: false }).map((l) => l.href)).not.toContain("/coach/multi");
    expect(coachHubLinks({ role: "COACH", canPlanAny: true }).map((l) => l.href)).toContain("/coach/multi");
  });
});
